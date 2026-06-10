import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly corsOrigins: string[]
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.corsOrigins,
        credentials: true,
      },
    });
    return server;
  }
}
