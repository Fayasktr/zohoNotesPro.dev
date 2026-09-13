const executionService = require('../services/execution.service');
const ResponseView = require('../views/response.view');

class ExecuteController {
    /**
     * POST /api/execute
     */
    async executeCode(req, res, next) {
        try {
            const { code, lang, stdin, args } = req.body;
            if (!code || !lang) {
                return ResponseView.badRequest(res, 'Both code and lang parameters are required');
            }

            const result = await executionService.execute(code, lang, { stdin, args });
            return ResponseView.success(res, result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/execute/languages
     */
    getSupportedLanguages(req, res) {
        return ResponseView.success(res, {
            languages: [
                { id: 'javascript', name: 'JavaScript (Node.js)', extension: '.js', runner: 'node' },
                { id: 'typescript', name: 'TypeScript', extension: '.ts', runner: 'ts-node' },
                { id: 'python', name: 'Python 3', extension: '.py', runner: 'python3' },
                { id: 'c', name: 'C (GCC)', extension: '.c', runner: 'gcc' },
                { id: 'cpp', name: 'C++ (G++)', extension: '.cpp', runner: 'g++' },
                { id: 'java', name: 'Java (OpenJDK)', extension: '.java', runner: 'javac' }
            ]
        });
    }
}

module.exports = new ExecuteController();
