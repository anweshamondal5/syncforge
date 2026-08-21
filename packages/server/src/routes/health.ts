import { Router, Request, Response } from 'express';
import { DocManager } from '../sync/DocManager';
import { WsSyncServer } from '../sync/WsSyncServer';

export function createHealthRouter(wsServer?: WsSyncServer): Router {
  const router = Router();

  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      activeRooms: DocManager.getActiveRoomCount(),
      activeConnections: wsServer ? wsServer.getActiveConnectionsCount() : 0,
      uptimeSeconds: process.uptime(),
    });
  });

  router.get('/stats', (req: Request, res: Response) => {
    const roomIds = DocManager.getActiveRoomIds();
    res.json({
      success: true,
      data: {
        activeRoomsCount: roomIds.length,
        roomIds,
        activeConnections: wsServer ? wsServer.getActiveConnectionsCount() : 0,
        memoryUsage: process.memoryUsage(),
      },
    });
  });

  return router;
}
