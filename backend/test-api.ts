import axios from 'axios';

(async () => {
  try {
    const payload = {
      invoice_no: 'INV-TEST-002',
      client_id: 'DONG_A_TRADE',
      bl_number: 'BL-TEST',
      vessel_name: 'TEST-VESSEL',
      pol: 'KR',
      pod: 'JP',
      exchange_rate: 1300,
      total_ocean_usd: 100,
      total_local_krw: 100000,
      final_amount_krw: 230000,
      bl_fee_krw: 40000,
      customs_fee_krw: 33000,
      due_date: '2026-07-31',
      items: [{
        vin: 'VIN-TEST-1',
        model_name: 'TEST-MODEL',
        cargo_type: 'Sedan',
        applied_ocean_usd: 100,
        applied_lashing_krw: 10000,
        applied_thc_krw: 10000,
        applied_wharfage_krw: 0,
        applied_inland_krw: 0
      }],
      shipmentIds: [1]
    };
    const res = await axios.post("http://localhost:5000/api/billing/invoices", payload);
    console.log("Success:", res.data);
  } catch (err: any) {
    console.error("Error:", err.response?.data || err.message);
  }
  process.exit(0);
})();
