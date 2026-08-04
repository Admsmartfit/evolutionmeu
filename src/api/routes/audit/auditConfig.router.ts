import { RouterBroker } from '@api/abstract/abstract.router';
import { AuditConfigDto, AuditConfigFindDto, AuditConfigRunDto, AuditConfigUpdateDto } from '@api/dto/auditConfig.dto';
import { EmptyDto } from '@api/dto/contactRoleMapping.dto';
import { HttpStatus } from '@api/routes/index.router';
import { auditConfigController } from '@api/server.module';
import { auditConfigSchema, auditConfigUpdateSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

export class AuditConfigRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post('/create', ...guards, async (req, res) => {
        const response = await this.dataValidate<AuditConfigDto>({
          request: req,
          schema: auditConfigSchema,
          ClassRef: AuditConfigDto,
          execute: (_, data) => auditConfigController.create(data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .put('/update/:auditConfigId', ...guards, async (req, res) => {
        const response = await this.dataValidate<AuditConfigUpdateDto>({
          request: req,
          schema: auditConfigUpdateSchema,
          ClassRef: AuditConfigUpdateDto,
          execute: (params, data) => auditConfigController.update(params as unknown as { auditConfigId: string }, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete('/delete/:auditConfigId', ...guards, async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: (params) => auditConfigController.delete(params as unknown as { auditConfigId: string }),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get('/find', ...guards, async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: (params) => auditConfigController.find(params as unknown as AuditConfigFindDto),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post('/run/:auditConfigId', ...guards, async (req, res) => {
        const response = await this.dataValidate<AuditConfigRunDto>({
          request: req,
          schema: null,
          ClassRef: AuditConfigRunDto,
          execute: (params, data) => auditConfigController.runNow(params as unknown as { auditConfigId: string }, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      });
  }

  public readonly router: Router = Router();
}
