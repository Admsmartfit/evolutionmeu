import { RouterBroker } from '@api/abstract/abstract.router';
import { AuditReportFindDto } from '@api/dto/auditReport.dto';
import { EmptyDto } from '@api/dto/contactRoleMapping.dto';
import { HttpStatus } from '@api/routes/index.router';
import { auditReportController } from '@api/server.module';
import { RequestHandler, Router } from 'express';

export class AuditReportRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .get('/find', ...guards, async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: (params) => auditReportController.find(params as unknown as AuditReportFindDto),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get('/:reportId/pdf', ...guards, async (req, res) => {
        const pdfBuffer = await auditReportController.getPdfBuffer({ reportId: req.params.reportId });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="auditoria-${req.params.reportId}.pdf"`);
        res.status(HttpStatus.OK).send(pdfBuffer);
      })
      .get('/:reportId', ...guards, async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: (params) => auditReportController.findById(params as unknown as { reportId: string }),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete('/:reportId', ...guards, async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: (params) => auditReportController.delete(params as unknown as { reportId: string }),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
