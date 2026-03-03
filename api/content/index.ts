import {
  getRoomsPayload,
  getSlidesPayload,
  getStoreSummary,
} from '../shared/contentStore';

export default async function (context: any, req: any) {
  if (req.method !== 'GET') {
    context.res = {
      status: 405,
      body: { error: 'Method not allowed' },
    };
    return;
  }

  const entity = (req.params?.entity || '').toLowerCase();
  const idParam = req.params?.id;

  try {
    if (entity === 'slides') {
      const payload = await getSlidesPayload();
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
      const payload = await getRoomsPayload();
      if (!idParam) {
        context.res = {
          status: 200,
          body: payload,
        };
        return;
      }

      const normalizedRoomId = idParam.toUpperCase();
      const room = payload.configurations.find(
        (config) => config.roomId === normalizedRoomId
      );
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
      const summary = await getStoreSummary();
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
  } catch (error: any) {
    context.log.error('[content] request failed', error);
    context.res = {
      status: 500,
      body: {
        error: 'Failed to serve content',
        details: error?.message || 'Unknown error',
      },
    };
  }
}
