const ResponseView = require('../views/response.view');
const Feedback = require('../models/Feedback');

class HealthController {
    /**
     * GET /api/ping
     */
    ping(req, res) {
        return res.status(200).send('pong');
    }

    /**
     * GET /api/health
     */
    health(req, res) {
        const mem = process.memoryUsage();
        return ResponseView.success(res, {
            status: 'ok',
            service: 'zoho-notes-pro-backend',
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            uptimeSec: Math.floor(process.uptime()),
            memory: {
                rssMb: (mem.rss / 1024 / 1024).toFixed(2),
                heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(2)
            }
        });
    }

    /**
     * POST /api/feedback (Authenticated user submits feedback)
     */
    async submitFeedback(req, res, next) {
        try {
            const { message, category } = req.body;
            if (!message || !message.trim()) {
                return ResponseView.badRequest(res, 'Feedback message cannot be empty');
            }

            const feedback = await Feedback.create({
                user: req.user.id,
                message: message.trim(),
                category: category || 'general'
            });

            return ResponseView.created(res, feedback, 'Feedback submitted successfully');
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new HealthController();
