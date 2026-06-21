// Wiring de infraestructura para los casos de uso del dominio.
// Punto único donde se instancian los repositorios concretos.
import {
  PrismaAuditLogger,
  PrismaTaskRepository,
  PrismaWorklogRepository,
} from '@pulso/database';

export const taskRepo = new PrismaTaskRepository();
export const worklogRepo = new PrismaWorklogRepository();
export const auditLogger = new PrismaAuditLogger();
