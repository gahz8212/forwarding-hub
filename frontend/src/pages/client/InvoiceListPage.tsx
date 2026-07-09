import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  Download, 
  CreditCard, 
  CheckCircle, 
  AlertCircle,
  FileText,
  Eye,
  X,
  Printer,
  Calendar,
  Globe,
  Coins
} from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";

interface Invoice {
  invoice_no: string;
  client_id: string;
  client_name: string;
  bl_number: string;
  vessel_name: string;
  pol: string;
  pod: string;
  exchange_rate: number;
  total_ocean_usd: number;
  total_local_krw: number;
  final_amount_krw: number;
  bl_fee_krw: number;
  customs_fee_krw: number;
  payment_status: "PENDING" | "PAID" | "OVERDUE";
  due_date: string;
  created_at: string;
}

interface InvoiceItem {
  id: number;
  invoice_no: string;
  vin: string;
  model_name: string;
  cargo_type: "SEDAN" | "SUV" | "TRUCK" | "BUS";
  applied_ocean_usd: number;
  applied_lashing_krw: number;
  applied_thc_krw: number;
  applied_wharfage_krw: number;
}

export default function InvoiceListPage() {
  const { user } = useAuthStore();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalBilled: 0,
    totalUnpaid: 0,
    totalPaid: 0,
  });

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:5000/api/billing/invoices", { withCredentials: true });
      if (res.data.success) {
        const list = res.data.invoices;
        setInvoices(list);
        
        // Calculate stats
        let total = 0;
        let unpaid = 0;
        let paid = 0;
        list.forEach((inv: Invoice) => {
          const amt = Number(inv.final_amount_krw);
          total += amt;
          if (inv.payment_status === "PAID") {
            paid += amt;
          } else {
            unpaid += amt;
          }
        });
        setStats({ totalBilled: total, totalUnpaid: unpaid, totalPaid: paid });
      }
    } catch (err) {
      console.error("Fetch invoices error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleOpenDetail = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDetailLoading(true);
    try {
      const res = await axios.get(`http://localhost:5000/api/billing/invoices/${invoice.invoice_no}`, { withCredentials: true });
      if (res.data.success) {
        setInvoiceItems(res.data.items);
      }
    } catch (err) {
      console.error("Fetch invoice detail error:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePayInvoice = async (invoiceNo: string) => {
    if (!window.confirm("이 청구서를 결제 완료 상태로 변경하시겠습니까?")) return;

    try {
      const res = await axios.post(`http://localhost:5000/api/billing/invoices/${invoiceNo}/pay`, {}, { withCredentials: true });
      if (res.data.success) {
        alert("결제 완료 처리되었습니다.");
        fetchInvoices();
        if (selectedInvoice && selectedInvoice.invoice_no === invoiceNo) {
          setSelectedInvoice({
            ...selectedInvoice,
            payment_status: "PAID"
          });
        }
      }
    } catch (err) {
      console.error("Pay invoice error:", err);
      alert("처리에 실패했습니다.");
    }
  };

  const printInvoice = () => {
    window.print();
  };

  return (
    <div className="animate-fade-in-up space-y-6 max-w-7xl mx-auto p-4 md:p-6 print:p-0 print:max-w-full">
      {/* Stats Summary Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">누적 청구 금액</p>
            <p className="text-2xl font-black text-slate-800 mt-1.5">₩{stats.totalBilled.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <CreditCard size={24} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">미결제 총액 (Unpaid)</p>
            <p className="text-2xl font-black text-red-600 mt-1.5">₩{stats.totalUnpaid.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-red-50 text-red-500 rounded-2xl">
            <AlertCircle size={24} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">결제 완료 총액</p>
            <p className="text-2xl font-black text-green-600 mt-1.5">₩{stats.totalPaid.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-green-50 text-green-500 rounded-2xl">
            <CheckCircle size={24} />
          </div>
        </div>
      </div>

      {/* Invoice List Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden print:hidden">
        <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">청구서 및 데빗노트 목록</h3>
          <span className="text-xs font-medium text-slate-400">최근 발행 순</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-4 pl-6">인보이스 번호</th>
                {user?.role === "admin" && <th className="p-4">화주명</th>}
                <th className="p-4">B/L 번호</th>
                <th className="p-4">선박명</th>
                <th className="p-4 text-right">청구 금액</th>
                <th className="p-4">적용 환율</th>
                <th className="p-4">납기일</th>
                <th className="p-4 text-center">결제 상태</th>
                <th className="p-4 text-center">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-semibold">
              {invoices.map((inv) => (
                <tr key={inv.invoice_no} className="hover:bg-slate-50/50 transition">
                  <td className="p-4 pl-6 text-slate-800 font-bold">{inv.invoice_no}</td>
                  {user?.role === "admin" && <td className="p-4 text-slate-600 font-bold">{inv.client_name}</td>}
                  <td className="p-4 text-blue-600">{inv.bl_number || "-"}</td>
                  <td className="p-4 text-slate-700">{inv.vessel_name}</td>
                  <td className="p-4 text-right font-black text-slate-800">₩{Number(inv.final_amount_krw).toLocaleString()}</td>
                  <td className="p-4 text-slate-500 font-medium">₩{Number(inv.exchange_rate).toLocaleString()}</td>
                  <td className="p-4 text-slate-400 font-medium text-xs">{inv.due_date ? inv.due_date.split("T")[0] : "-"}</td>
                  <td className="p-4 text-center">
                    {inv.payment_status === "PAID" ? (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-600 border border-green-200">
                        완료
                      </span>
                    ) : (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                        미결제
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => handleOpenDetail(inv)}
                        className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition border border-indigo-100"
                        title="청구서 상세 보기"
                      >
                        <Eye size={15} />
                      </button>
                      {user?.role === "admin" && inv.payment_status !== "PAID" && (
                        <button 
                          onClick={() => handlePayInvoice(inv.invoice_no)}
                          className="text-green-600 hover:bg-green-50 p-2 rounded-lg transition border border-green-100"
                          title="결제 완료 처리"
                        >
                          <CheckCircle size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={user?.role === "admin" ? 9 : 8} className="p-8 text-center text-slate-400">
                    발행된 정산서(인보이스) 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice (Debit Note) Detail Viewer Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:static print:bg-white print:p-0 print:z-0">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-100 my-8 print:my-0 print:shadow-none print:border-none print:rounded-none">
            {/* Modal Header (Hidden on Print) */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <FileText size={20} />
                <h3 className="font-bold text-lg">데빗노트 (Debit Note) 청구 상세</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={printInvoice}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 transition rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer size={14} /> 인쇄하기
                </button>
                <button 
                  onClick={() => setSelectedInvoice(null)}
                  className="text-white/60 hover:text-white transition font-bold"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Print Content Area */}
            <div className="p-8 md:p-12 space-y-8 print:p-0 text-slate-800">
              
              {/* Invoice Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b pb-6">
                <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">DEBIT NOTE</h1>
                  <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Digital Forwarding Hub Services</p>
                  
                  <div className="mt-4 text-xs font-medium text-slate-500 space-y-1">
                    <div>발행처: 주식회사 제로콜 로지스틱스</div>
                    <div>주소: 부산광역시 중구 중앙대로 123 (중앙동)</div>
                    <div>전화: 02-1234-5678 | Email: settlement@zerocall.com</div>
                  </div>
                </div>

                <div className="text-right sm:text-right text-xs font-semibold text-slate-700 space-y-1 bg-slate-50 p-4 rounded-2xl border border-slate-100 min-w-[200px]">
                  <div><span className="text-slate-400">정산 번호:</span> {selectedInvoice.invoice_no}</div>
                  <div><span className="text-slate-400">발행 일자:</span> {selectedInvoice.created_at ? selectedInvoice.created_at.split("T")[0] : "-"}</div>
                  <div><span className="text-slate-400">청구 대상:</span> {selectedInvoice.client_name}</div>
                  <div className="text-red-600 font-bold"><span className="text-slate-400">납기 기한:</span> {selectedInvoice.due_date ? selectedInvoice.due_date.split("T")[0] : "-"}</div>
                </div>
              </div>

              {/* Shipment Details Metadata Box */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <span className="block text-slate-400 font-bold mb-1">선박명 (Vessel)</span>
                  <span className="font-extrabold text-slate-700">{selectedInvoice.vessel_name}</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-bold mb-1">B/L 번호</span>
                  <span className="font-extrabold text-blue-600">{selectedInvoice.bl_number || "-"}</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-bold mb-1">선적항 (POL)</span>
                  <span className="font-extrabold text-slate-700">{selectedInvoice.pol || "-"}</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-bold mb-1">양하항 (POD)</span>
                  <span className="font-extrabold text-slate-700">{selectedInvoice.pod || "-"}</span>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                    <tr>
                      <th className="p-3 pl-4">No.</th>
                      <th className="p-3">차대번호 (VIN)</th>
                      <th className="p-3">차종 / 모델명</th>
                      <th className="p-3 text-right">해상운임 (USD)</th>
                      <th className="p-3 text-right">고박료 (Lashing, KRW)</th>
                      <th className="p-3 text-right">터미널료 (THC, KRW)</th>
                      <th className="p-3 text-right">부두사용료 (Wharfage, KRW)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {detailLoading ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center">
                          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        </td>
                      </tr>
                    ) : (
                      invoiceItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition">
                          <td className="p-3 pl-4 text-slate-400 font-bold">{idx + 1}</td>
                          <td className="p-3 font-bold text-slate-800">{item.vin}</td>
                          <td className="p-3 text-slate-600">
                            <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded mr-1 font-bold text-[10px]">{item.cargo_type}</span>
                            {item.model_name}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-700">
                            ${Number(item.applied_ocean_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-700">
                            ₩{Number(item.applied_lashing_krw).toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-700">
                            ₩{Number(item.applied_thc_krw).toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-700">
                            ₩{Number(item.applied_wharfage_krw || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pass-through costs details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 border rounded-xl bg-slate-50 border-slate-100 text-xs font-semibold text-slate-500 flex justify-between">
                  <span>Pass-through 서류비 (B/L Fee):</span>
                  <span className="font-extrabold text-slate-700">₩{Number(selectedInvoice.bl_fee_krw || 40000).toLocaleString()}</span>
                </div>
                <div className="p-3 border rounded-xl bg-slate-50 border-slate-100 text-xs font-semibold text-slate-500 flex justify-between">
                  <span>Pass-through 관세사 수수료 (Customs):</span>
                  <span className="font-extrabold text-slate-700">₩{Number(selectedInvoice.customs_fee_krw || 33000).toLocaleString()}</span>
                </div>
              </div>

              {/* Calculation Summary Breakdowns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div className="text-xs font-semibold text-slate-500 space-y-2 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-1 text-slate-700 font-extrabold mb-1">
                    <Globe size={14} className="text-indigo-500" /> 외화 정산 요약
                  </div>
                  <div className="flex justify-between">
                    <span>총 해상운임 (USD):</span>
                    <span className="text-slate-800 font-bold">${Number(selectedInvoice.total_ocean_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>적용 환율 (1 USD):</span>
                    <span className="text-slate-800 font-bold">₩{Number(selectedInvoice.exchange_rate).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 text-indigo-600 font-bold">
                    <span>원화 환산 금액 (절사):</span>
                    <span>₩{Math.floor(Number(selectedInvoice.total_ocean_usd) * Number(selectedInvoice.exchange_rate)).toLocaleString()}</span>
                  </div>
                </div>

                <div className="text-xs font-semibold text-slate-500 space-y-2 bg-indigo-50/30 p-5 rounded-2xl border border-indigo-100/50">
                  <div className="flex items-center gap-1 text-indigo-800 font-extrabold mb-1">
                    <Coins size={14} className="text-indigo-600" /> 최종 정산 금액 구성
                  </div>
                  <div className="flex justify-between">
                    <span>해상 운임 환산액 (KRW):</span>
                    <span className="text-slate-800 font-bold">₩{Math.floor(Number(selectedInvoice.total_ocean_usd) * Number(selectedInvoice.exchange_rate)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>로컬 비용 합계 (KRW):</span>
                    <span className="text-slate-800 font-bold">₩{Number(selectedInvoice.total_local_krw).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base text-indigo-700 font-black">
                    <span>합계 청구 금액:</span>
                    <span>₩{Number(selectedInvoice.final_amount_krw).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              <div className="border-t pt-6 text-xs text-slate-500 text-center font-bold">
                <p>송금 계좌 안내: 부산은행 123-45-678901 (주)제로콜 로지스틱스</p>
                <p className="mt-1 text-slate-400 font-medium">※ 기한 내 송금 부탁드리며, 문의사항은 정산팀(02-1234-5678)으로 연락바랍니다.</p>
              </div>

            </div>

            {/* Modal Footer (Hidden on Print) */}
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3 print:hidden">
              {user?.role === "admin" && selectedInvoice.payment_status !== "PAID" && (
                <button
                  onClick={() => handlePayInvoice(selectedInvoice.invoice_no)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded-xl transition"
                >
                  결제 완료 처리
                </button>
              )}
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 border rounded-xl hover:bg-slate-100 font-bold text-xs text-slate-600 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
