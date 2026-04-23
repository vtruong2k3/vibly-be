import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { SOCKET_EVENTS } from '../../common/constants/socket-events';
import { Report } from '@prisma/client';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class AdminGateway {
    @WebSocketServer()
    server: Server;

    /**
     * Broadcasts to all connected admins that a new report was filed.
     */
    broadcastNewReport(report: Partial<Report>) {
        this.server.to('admin_room').emit(SOCKET_EVENTS.ADMIN_NEW_REPORT, report);
    }
}
