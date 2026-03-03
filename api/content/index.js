"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const contentStore_1 = require("../shared/contentStore");
async function default_1(context, req) {
    var _a, _b;
    if (req.method !== 'GET') {
        context.res = {
            status: 405,
            body: { error: 'Method not allowed' },
        };
        return;
    }
    const entity = (((_a = req.params) === null || _a === void 0 ? void 0 : _a.entity) || '').toLowerCase();
    const idParam = (_b = req.params) === null || _b === void 0 ? void 0 : _b.id;
    try {
        if (entity === 'slides') {
            const payload = await (0, contentStore_1.getSlidesPayload)();
            if (!idParam) {
                context.res = {
                    status: 200,
                    body: payload,
                };
                return;
            }
            const slide = payload.ALL_SLIDES.find((s) => s.id === idParam);
            if (!slide) {
                context.res = {
                    status: 404,
                    body: { error: `Slide "${idParam}" not found` },
                };
                return;
            }
            context.res = {
                status: 200,
                body: slide,
            };
            return;
        }
        if (entity === 'rooms') {
            const payload = await (0, contentStore_1.getRoomsPayload)();
            if (!idParam) {
                context.res = {
                    status: 200,
                    body: payload,
                };
                return;
            }
            const normalizedRoomId = idParam.toUpperCase();
            const room = payload.configurations.find((config) => config.roomId === normalizedRoomId);
            if (!room) {
                context.res = {
                    status: 404,
                    body: { error: `Room "${normalizedRoomId}" not found` },
                };
                return;
            }
            context.res = {
                status: 200,
                body: room,
            };
            return;
        }
        if (entity === 'summary') {
            const summary = await (0, contentStore_1.getStoreSummary)();
            context.res = {
                status: 200,
                body: summary,
            };
            return;
        }
        context.res = {
            status: 404,
            body: {
                error: `Unknown content entity "${entity}". Use slides, rooms, or summary.`,
            },
        };
    }
    catch (error) {
        context.log.error('[content] request failed', error);
        context.res = {
            status: 500,
            body: {
                error: 'Failed to serve content',
                details: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error',
            },
        };
    }
}
