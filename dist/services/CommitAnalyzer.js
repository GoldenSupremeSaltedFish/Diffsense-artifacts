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
exports.CommitAnalyzer = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class CommitAnalyzer {
    databaseService;
    workspaceRoot;
    isAnalyzing = false;
    constructor(databaseService, workspaceRoot) {
        this.databaseService = databaseService;
        this.workspaceRoot = workspaceRoot;
    }
    async analyzeCommit(commitInfo) {
        if (this.isAnalyzing) {
            return;
        }
        this.isAnalyzing = true;
        try {
            // Check if commit already processed
            const hasProcessed = await this.databaseService.hasCommit(commitInfo.sha);
            if (hasProcessed) {
                console.log(`Commit ${commitInfo.sha} already processed, skipping`);
                return;
            }
            console.log(`Analyzing commit: ${commitInfo.sha}`);
            // Process each file in the commit
            for (const filePath of commitInfo.files) {
                await this.processFileChange(filePath, commitInfo);
            }
            // Record commit as processed
            await this.databaseService.recordCommit(commitInfo.sha, commitInfo.timestamp);
            console.log(`Commit analysis completed: ${commitInfo.sha}`);
        }
        catch (error) {
            await this.databaseService.logError('analyze-commit', `Failed to analyze commit ${commitInfo.sha}: ${error instanceof Error ? error.message : String(error)}`, 'commit-analysis');
            throw error;
        }
        finally {
            this.isAnalyzing = false;
        }
    }
    async processFileChange(filePath, commitInfo) {
        try {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            // Skip if file doesn't exist or is not a supported file type
            if (!fs.existsSync(filePath)) {
                return;
            }
            const fileStats = fs.statSync(filePath);
            if (!fileStats.isFile()) {
                return;
            }
            // Get current metrics for the file
            const currentMetrics = await this.databaseService.getFileMetrics(relativePath);
            // Calculate new metrics
            const newMetrics = await this.calculateFileMetrics(filePath, currentMetrics);
            // Update database
            await this.databaseService.updateFileMetrics(relativePath, {
                ...newMetrics,
                last_commit_sha: commitInfo.sha,
                churn: (currentMetrics?.churn || 0) + 1
            });
        }
        catch (error) {
            await this.databaseService.logError('process-file-change', `Failed to process file change: ${error instanceof Error ? error.message : String(error)}`, filePath);
        }
    }
    async calculateFileMetrics(filePath, currentMetrics) {
        const ext = path.extname(filePath).toLowerCase();
        const lang = this.getLanguageFromExtension(ext);
        let complexity = 0;
        let fiis_score = 0;
        let ffis_score = 0;
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            // Calculate complexity based on file type
            complexity = this.calculateComplexity(content, lang);
            // Calculate FFIS/FIIS scores (placeholder - integrate with existing classifier)
            const scores = await this.calculateImpactScores(content, filePath, lang);
            fiis_score = scores.fiis_score;
            ffis_score = scores.ffis_score;
        }
        catch (error) {
            // If we can't read the file, use existing metrics or defaults
            complexity = currentMetrics?.complexity || 0;
            fiis_score = currentMetrics?.fiis_score || 0;
            ffis_score = currentMetrics?.ffis_score || 0;
        }
        return {
            complexity,
            fiis_score,
            ffis_score,
            lang
        };
    }
    getLanguageFromExtension(ext) {
        const langMap = {
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.vue': 'vue',
            '.py': 'python',
            '.java': 'java',
            '.go': 'go',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp',
            '.php': 'php',
            '.rb': 'ruby',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.rs': 'rust',
            '.scala': 'scala',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.less': 'less',
            '.json': 'json',
            '.xml': 'xml',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.md': 'markdown',
            '.sh': 'shell',
            '.sql': 'sql'
        };
        return langMap[ext] || 'unknown';
    }
    calculateComplexity(content, lang) {
        const lines = content.split('\n');
        let complexity = 0;
        // Basic complexity calculation based on language patterns
        switch (lang) {
            case 'javascript':
            case 'typescript':
            case 'vue':
                complexity = this.calculateJSComplexity(content);
                break;
            case 'python':
                complexity = this.calculatePythonComplexity(content);
                break;
            case 'java':
                complexity = this.calculateJavaComplexity(content);
                break;
            default:
                // Fallback: complexity based on lines of code
                complexity = Math.floor(lines.length / 10);
        }
        return Math.min(complexity, 100); // Cap at 100
    }
    calculateJSComplexity(content) {
        let complexity = 0;
        // Count control flow statements
        const controlFlowPatterns = [
            /\b(if|else|switch|case|default)\b/g,
            /\b(for|while|do)\b/g,
            /\b(try|catch|finally)\b/g,
            /\b(break|continue|return)\b/g,
            /\b(function|class|interface)\b/g,
            /\b(async|await)\b/g,
            /\b(new|delete|typeof|instanceof)\b/g,
            /\b(import|export|require)\b/g
        ];
        controlFlowPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        });
        // Count nesting depth
        const nestingMatches = content.match(/[{\[](?:[^{\[]*[{\[])*[}\]]/g);
        if (nestingMatches) {
            complexity += nestingMatches.length;
        }
        return Math.floor(complexity / 5); // Normalize
    }
    calculatePythonComplexity(content) {
        let complexity = 0;
        const patterns = [
            /\b(if|elif|else)\b/g,
            /\b(for|while)\b/g,
            /\b(try|except|finally)\b/g,
            /\b(def|class|lambda)\b/g,
            /\b(import|from|as)\b/g,
            /\b(and|or|not|in|is)\b/g,
            /\b(with|yield|async|await)\b/g
        ];
        patterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        });
        return Math.floor(complexity / 3);
    }
    calculateJavaComplexity(content) {
        let complexity = 0;
        const patterns = [
            /\b(if|else|switch|case|default)\b/g,
            /\b(for|while|do)\b/g,
            /\b(try|catch|finally)\b/g,
            /\b(class|interface|enum)\b/g,
            /\b(public|private|protected|static|final)\b/g,
            /\b(new|throw|throws)\b/g,
            /\b(import|package)\b/g,
            /\b(synchronized|volatile|transient)\b/g
        ];
        patterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        });
        return Math.floor(complexity / 4);
    }
    async calculateImpactScores(content, filePath, lang) {
        // Placeholder for FFIS/FIIS calculation
        // This should integrate with your existing FrontendChangeClassifier
        // For now, return basic scores based on file characteristics
        const lines = content.split('\n').length;
        const hasImports = content.includes('import') || content.includes('require') || content.includes('from');
        const hasExports = content.includes('export') || content.includes('module.exports');
        let fiis_score = 0;
        let ffis_score = 0;
        // Basic FIIS (File Impact Importance Score)
        if (hasImports)
            fiis_score += 10;
        if (hasExports)
            fiis_score += 15;
        if (lines > 100)
            fiis_score += 20;
        if (lines > 200)
            fiis_score += 10;
        // Basic FFIS (File Functional Importance Score)
        if (content.includes('function') || content.includes('class'))
            ffis_score += 20;
        if (content.includes('component') || content.includes('Component'))
            ffis_score += 25;
        if (content.includes('service') || content.includes('api'))
            ffis_score += 15;
        return {
            fiis_score: Math.min(fiis_score, 100),
            ffis_score: Math.min(ffis_score, 100)
        };
    }
    async getHotspotAnalysis(limit = 50) {
        return await this.databaseService.getHotspotFiles(limit);
    }
    async getFileMetricsHistory(filePath) {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        return await this.databaseService.getFileMetrics(relativePath);
    }
}
exports.CommitAnalyzer = CommitAnalyzer;
