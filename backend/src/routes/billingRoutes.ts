import { Router } from 'express';
import {
  getClients,
  saveClient,
  getCostRates,
  saveCostRates,
  calculateInvoice,
  createInvoice,
  getInvoices,
  getInvoiceDetail,
  payInvoice,
  deleteInvoice,
  publishInvoices,
  mergeAndPublishInvoices,
  getLatestExchangeRate
} from '../controllers/billingController';

const router = Router();

router.get('/clients', getClients);
router.post('/clients', saveClient);

router.get('/costs', getCostRates);
router.post('/costs', saveCostRates);

router.get('/exchange-rate', getLatestExchangeRate);

router.post('/invoices/calculate', calculateInvoice);
router.post('/invoices', createInvoice);
router.put('/invoices/publish', publishInvoices);
router.post('/invoices/merge', mergeAndPublishInvoices);
router.get('/invoices', getInvoices);
router.get('/invoices/:invoiceNo', getInvoiceDetail);
router.post('/invoices/:invoiceNo/pay', payInvoice);
router.delete('/invoices/:invoiceNo', deleteInvoice);

export default router;
