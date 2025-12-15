"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const worker_threads_1 = require("worker_threads");
const events_1 = require("events");
class DatabaseService extends events_1.EventEmitter {
    static instance;
    worker = null;
    dbPath;
    config;
    isInitialized = false;
    messageId = 0;
    pendingRequests = new Map();
    constructor(context, config) {
        super();
        this.config = {
            dbPath: path.join(context.globalStorageUri.fsPath, 'diffsense.db'),
            enableWorker: true,
            maxRetries: 3,
            retryDelay: 50,
            cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
            maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
            enableCorruptionRecovery: true,
            ...config
        };
        this.dbPath = this.config.dbPath;
        this.ensureDirectoryExists();
    }
    static getInstance(context, config) {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService(context, config);
        }
        return DatabaseService.instance;
    }
    ensureDirectoryExists() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    async cleanupData(cutoffTime) {
        await this.withRetry(async () => {
            if (this.config.enableWorker) {
                // Send a custom cleanup command if needed, or just use the standard cleanup mechanism
                // For now, we'll reuse the cleanup mechanism but force a specific cutoff
                // Since the worker has its own cleanup logic, we might need to add a new message type
                // or just rely on the initialization cleanup.
                // Let's add a specific cleanup message type to the worker.
                await this.sendWorkerMessage('cleanupData', { cutoffTime });
            }
        });
    }
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            if (this.config.enableWorker) {
                await this.initializeWorker();
            }
            else {
                await this.initializeDirect();
            }
            this.isInitialized = true;
            this.emit('initialized');
            // Start cleanup interval
            setInterval(() => this.cleanup(), this.config.cleanupInterval);
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    async initializeWorker() {
        const workerPath = path.join(__dirname, 'database-worker.js');
        this.worker = new worker_threads_1.Worker(workerPath, {
            workerData: {
                dbPath: this.dbPath,
                config: this.config
            }
        });
        this.worker.on('message', (message) => {
            if (message.id && this.pendingRequests.has(message.id)) {
                const { resolve, reject } = this.pendingRequests.get(message.id);
                this.pendingRequests.delete(message.id);
                if (message.error) {
                    reject(new Error(message.error));
                }
                else {
                    resolve(message.result);
                }
            }
        });
        this.worker.on('error', (error) => {
            this.emit('error', error);
        });
        this.worker.on('exit', (code) => {
            if (code !== 0) {
                this.emit('error', new Error(`Worker stopped with exit code ${code}`));
            }
        });
        // Wait for worker initialization
        await this.sendWorkerMessage('initialize');
    }
    async initializeDirect() {
        // Direct initialization will be implemented in the main thread
        // For now, we'll use worker-based approach
        throw new Error('Direct initialization not implemented yet');
    }
    async sendWorkerMessage(action, data = {}, timeout = 30000) {
        if (!this.worker) {
            throw new Error('Worker not initialized');
        }
        const id = ++this.messageId;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({
                id,
                action,
                data
            });
            // Timeout
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Database operation timeout'));
                }
            }, timeout);
        });
    }
    // Database operations with retry mechanism
    async withRetry(operation, retries = this.config.maxRetries) {
        let lastError = new Error('Unknown error');
        for (let i = 0; i <= retries; i++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                // Check for database corruption
                if (this.isDatabaseCorrupted(error)) {
                    await this.handleDatabaseCorruption();
                    continue;
                }
                // Retry with exponential backoff
                if (i < retries) {
                    const delay = this.config.retryDelay * Math.pow(2, i);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        // Log error and throw
        await this.logError('database_operation', lastError.message);
        throw lastError;
    }
    isDatabaseCorrupted(error) {
        const errorMessage = error?.message || '';
        return errorMessage.includes('database disk image is malformed') ||
            errorMessage.includes('database is locked') ||
            errorMessage.includes('SQLITE_CORRUPT');
    }
    async handleDatabaseCorruption() {
        try {
            // Close worker if exists
            if (this.worker) {
                await this.worker.terminate();
                this.worker = null;
            }
            // Try to backup the corrupted file (just in case)
            const backupPath = `${this.dbPath}.backup.${Date.now()}`;
            try {
                fs.copyFileSync(this.dbPath, backupPath);
                console.log(`Created backup of corrupted database: ${backupPath}`);
            }
            catch (backupError) {
                console.warn('Failed to create backup:', backupError);
            }
            // Delete corrupted database
            if (fs.existsSync(this.dbPath)) {
                fs.unlinkSync(this.dbPath);
            }
            // Also remove WAL files if they exist
            const walPath = `${this.dbPath}-wal`;
            const shmPath = `${this.dbPath}-shm`;
            if (fs.existsSync(walPath)) {
                fs.unlinkSync(walPath);
            }
            if (fs.existsSync(shmPath)) {
                fs.unlinkSync(shmPath);
            }
            // Show recovery notification to user
            vscode.window.showInformationMessage('DiffSense database was corrupted and has been recreated. Your analysis data will be rebuilt as you work.');
            // Reinitialize
            await this.initializeWorker();
            this.emit('database_recreated');
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    // Public API methods
    async updateFileMetrics(filePath, metrics) {
        await this.withRetry(async () => {
            if (this.config.enableWorker) {
                await this.sendWorkerMessage('updateFileMetrics', { filePath, metrics });
            }
        });
    }
    async getFileMetrics(filePath) {
        return await this.withRetry(async () => {
            if (this.config.enableWorker) {
                return await this.sendWorkerMessage('getFileMetrics', { filePath });
            }
            return null;
        });
    }
    async getAllFileMetrics(limit = 1000) {
        return await this.withRetry(async () => {
            if (this.config.enableWorker) {
                return await this.sendWorkerMessage('getAllFileMetrics', { limit });
            }
            return [];
        });
    }
    async getHotspotFiles(limit = 50) {
        return await this.withRetry(async () => {
            if (this.config.enableWorker) {
                return await this.sendWorkerMessage('getHotspotFiles', { limit });
            }
            return [];
        });
    }
    async analyzeHotspots(workspacePath, options = {}) {
        return await this.withRetry(async () => {
            if (this.config.enableWorker) {
                return await this.sendWorkerMessage('analyzeHotspots', {
                    workspacePath,
                    options
                });
            }
            return { hotspots: [], summary: { totalFiles: 0, highRiskFiles: 0, mediumRiskFiles: 0, criticalRiskFiles: 0, averageChurn: 0, averageComplexity: 0, topLanguages: [] } };
        });
    }
    async recordCommit(sha, timestamp) {
        await this.withRetry(async () => {
            if (this.config.enableWorker) {
                await this.sendWorkerMessage('recordCommit', { sha, timestamp });
            }
        });
    }
    async hasCommit(sha) {
        return await this.withRetry(async () => {
            if (this.config.enableWorker) {
                return await this.sendWorkerMessage('hasCommit', { sha });
            }
            return false;
        });
    }
    async logError(action, message, file) {
        const errorLog = {
            timestamp: Date.now(),
            file,
            action,
            message
        };
        await this.withRetry(async () => {
            if (this.config.enableWorker) {
                await this.sendWorkerMessage('logError', errorLog);
            }
        });
    }
    async cleanup() {
        await this.withRetry(async () => {
            if (this.config.enableWorker) {
                await this.sendWorkerMessage('cleanup', {
                    maxAge: this.config.maxAge
                });
            }
        });
    }
    async getDatabaseStats() {
        return await this.withRetry(async () => {
            if (this.config.enableWorker) {
                return await this.sendWorkerMessage('getStats');
            }
            return {};
        });
    }
    async saveAnalysisResult(workspacePath, analysisType, results, analysisOptions, summary, errorMessage) {
        await this.withRetry(async () => {
            if (this.config.enableWorker) {
                await this.sendWorkerMessage('saveAnalysisResult', {
                    workspacePath,
                    analysisType,
                    results,
                    analysisOptions,
                    summary,
                    errorMessage
                });
            }
        });
    }
    async getAnalysisResults(workspacePath, analysisType, limit = 50) {
        return await this.withRetry(async () => {
            if (this.config.enableWorker) {
                return await this.sendWorkerMessage('getAnalysisResults', {
                    workspacePath,
                    analysisType,
                    limit
                });
            }
            return [];
        });
    }
    async getLatestAnalysisResult(workspacePath, analysisType) {
        return await this.withRetry(async () => {
            if (this.config.enableWorker) {
                return await this.sendWorkerMessage('getLatestAnalysisResult', {
                    workspacePath,
                    analysisType
                });
            }
            return null;
        });
    }
    async dispose() {
        if (this.worker) {
            try {
                // Try to close database gracefully
                await this.sendWorkerMessage('close', {}, 1000);
            }
            catch (e) {
                // Ignore errors during close
            }
            await this.worker.terminate();
            this.worker = null;
        }
        this.removeAllListeners();
    }
}
exports.DatabaseService = DatabaseService;
