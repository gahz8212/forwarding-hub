import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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
  Coins,
  Trash2
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
  applied_inland_krw: number;
}

export default function InvoiceListPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedInvoiceNos, setSelectedInvoiceNos] = useState<string[]>([]);

  // Stats
  const [stats, setStats] = useState({
    totalBilled: 0,
    totalUnpaid: 0,
    totalPaid: 0,
  });

  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:5000/api/billing/invoices", { withCredentials: true });
      if (res.data.success) {
        const list = res.data.invoices;
        setInvoices(list);
        
        setInvoices(list);
      }
    } catch (err) {
      console.error("Fetch invoices error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Derive filtered invoices and stats dynamically
  const uniqueClients = Array.from(new Set(invoices.map((inv) => inv.client_name))).filter(Boolean);
  const filteredInvoices = invoices.filter((inv) => {
    const matchesClient = selectedClientFilter === "ALL" || inv.client_name === selectedClientFilter;
    const matchesQuery = !searchQuery || 
      inv.invoice_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.bl_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.vessel_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.client_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesClient && matchesQuery;
  });

  useEffect(() => {
    let total = 0;
    let unpaid = 0;
    let paid = 0;
    filteredInvoices.forEach((inv) => {
      const amt = Number(inv.final_amount_krw);
      total += amt;
      if (inv.payment_status === "PAID") {
        paid += amt;
      } else {
        unpaid += amt;
      }
    });
    setStats({ totalBilled: total, totalUnpaid: unpaid, totalPaid: paid });
  }, [filteredInvoices]);

  useEffect(() => {
    fetchInvoices();
  }, []);

  useEffect(() => {
    const invoiceNo = searchParams.get("invoiceNo");
    if (invoiceNo && invoices.length > 0) {
      const matched = invoices.find(inv => inv.invoice_no === invoiceNo);
      if (matched) {
        handleOpenDetail(matched);
      }
    }
  }, [invoices, searchParams]);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (selectedInvoice) {
      document.body.style.overflow = "hidden";
      const mainEl = document.querySelector("main");
      if (mainEl) {
        mainEl.style.overflow = "hidden";
      }
    } else {
      document.body.style.overflow = "";
      const mainEl = document.querySelector("main");
      if (mainEl) {
        mainEl.style.overflow = "";
      }
    }
    return () => {
      document.body.style.overflow = "";
      const mainEl = document.querySelector("main");
      if (mainEl) {
        mainEl.style.overflow = "";
      }
    };
  }, [selectedInvoice]);

  const handleCloseDetail = () => {
    setSelectedInvoice(null);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("invoiceNo");
    setSearchParams(newParams);
  };

  const toggleInvoiceSelection = (invoiceNo: string) => {
    setSelectedInvoiceNos(prev => 
      prev.includes(invoiceNo) ? prev.filter(no => no !== invoiceNo) : [...prev, invoiceNo]
    );
  };

  const handlePublishInvoices = async () => {
    if (selectedInvoiceNos.length === 0) return alert("전송할 정산서를 선택해주세요.");
    if (!window.confirm(`선택한 ${selectedInvoiceNos.length}건의 정산서를 화주에게 전송하시겠습니까?`)) return;

    try {
      const res = await axios.put("http://localhost:5000/api/billing/invoices/publish", { invoiceNos: selectedInvoiceNos }, { withCredentials: true });
      if (res.data.success) {
        alert(res.data.message);
        setSelectedInvoiceNos([]);
        fetchInvoices();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "전송 중 오류가 발생했습니다.");
    }
  };

  const handleMergeAndPublishInvoices = async () => {
    if (selectedInvoiceNos.length < 2) return alert("병합하려면 2개 이상의 임시(DRAFT) 정산서를 선택해주세요.");
    const selectedDrafts = filteredInvoices.filter(i => selectedInvoiceNos.includes(i.invoice_no));
    
    const clientId = selectedDrafts[0].client_id;
    if (selectedDrafts.some(i => i.client_id !== clientId)) {
      return alert("동일한 화주의 정산서만 병합할 수 있습니다. 상단에서 화주를 먼저 필터링해주세요.");
    }
    if (selectedDrafts.some((i: any) => i.publish_status !== 'DRAFT')) {
      return alert("이미 전송 완료(SENT)된 정산서는 병합할 수 없습니다. 임시(DRAFT) 정산서만 선택해주세요.");
    }

    const newInvoiceNo = window.prompt("새로운 월합계 정산서 번호를 입력해주세요 (예: INV-2026-07)");
    if (!newInvoiceNo) return;

    const dueDate = selectedDrafts[0].due_date;

    if (!window.confirm(`선택한 ${selectedInvoiceNos.length}건을 [${newInvoiceNo}] 번호로 합쳐서 화주에게 전송하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;

    try {
      const res = await axios.post("http://localhost:5000/api/billing/invoices/merge", { 
        invoiceNos: selectedInvoiceNos,
        newInvoiceNo,
        dueDate
      }, { withCredentials: true });
      if (res.data.success) {
        alert(res.data.message);
        setSelectedInvoiceNos([]);
        fetchInvoices();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "병합 전송 중 오류가 발생했습니다.");
    }
  };

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

  const handleDeleteInvoice = async (invoiceNo: string) => {
    if (!window.confirm("정말로 이 정산서를 삭제(발행 취소)하시겠습니까?\n\n삭제 시 해당 선적건은 다시 미청구 상태로 돌아갑니다.")) return;

    try {
      const res = await axios.delete(`http://localhost:5000/api/billing/invoices/${invoiceNo}`, { withCredentials: true });
      if (res.data.success) {
        alert("정산서가 성공적으로 삭제되었습니다.");
        fetchInvoices();
        if (selectedInvoice && selectedInvoice.invoice_no === invoiceNo) {
          handleCloseDetail();
        }
      }
    } catch (err: any) {
      console.error("Delete invoice error:", err);
      alert(err.response?.data?.message || "삭제 처리에 실패했습니다.");
    }
  };

  const printInvoice = () => {
    window.print();
  };

  return (
    <div className="w-full p-4 md:p-6 print:p-0 print:max-w-full">
      <div className="animate-fade-in-up space-y-6">
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
        <div className="p-6 border-b bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">청구서 및 데빗노트 목록</h3>
            <span className="text-xs font-medium text-slate-400 mt-1 block">최근 발행 순</span>
          </div>
          {user?.role === "admin" && (
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">화주 선택:</span>
                  <select
                    className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-[160px]"
                    value={selectedClientFilter}
                    onChange={(e) => setSelectedClientFilter(e.target.value)}
                  >
                    <option value="ALL">전체 보기</option>
                    {uniqueClients.map((client) => (
                      <option key={client} value={client}>{client}</option>
                    ))}
                  </select>
                </div>
               
              </div>
              <div className="flex items-center gap-2 border-l border-slate-200 pl-4 h-16">
                <button onClick={handlePublishInvoices} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer">
                  <Globe size={14} /> 건별 전송
                </button>
                <button onClick={handleMergeAndPublishInvoices} className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer">
                  <Calendar size={14} /> 월말 전송
                </button>
              </div>
            </div>
          )}
        </div>
        {/* Invoice List (Desktop: Table, Mobile: Cards) */}
        {filteredInvoices.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-100 dark:border-slate-800 text-sm font-bold text-slate-400">
            발행된 정산서(인보이스) 내역이 없습니다.
          </div>
        ) : (
          <>
            {/* 모바일 카드 뷰 (lg 미만) */}
            <div className="block lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
              {filteredInvoices.map((inv: any) => (
                <div 
                  key={inv.invoice_no}
                  className={`p-4 rounded-2xl border bg-white dark:bg-slate-900 transition duration-150 flex flex-col justify-between shadow-3xs hover:shadow-2xs hover:border-slate-350 dark:hover:border-slate-700 ${
                    selectedInvoiceNos.includes(inv.invoice_no)
                      ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/5 ring-1 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    {/* Header: Checkbox & Invoice No */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        {user?.role === "admin" && (
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 cursor-pointer rounded border-slate-300 dark:border-slate-700 text-indigo-600 accent-indigo-600"
                            checked={selectedInvoiceNos.includes(inv.invoice_no)}
                            onChange={() => toggleInvoiceSelection(inv.invoice_no)}
                            disabled={inv.publish_status !== 'DRAFT'}
                          />
                        )}
                        <span className="text-slate-800 dark:text-slate-200 font-extrabold text-sm tracking-tight">{inv.invoice_no}</span>
                      </div>
                      {user?.role === "admin" && (
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-105 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {inv.client_name}
                        </span>
                      )}
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wide ${
                        inv.publish_status === "DRAFT" 
                          ? "bg-slate-100 text-slate-600 dark:bg-slate-850 dark:text-slate-400" 
                          : "bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400"
                      }`}>
                        {inv.publish_status === "DRAFT" ? "임시(DRAFT)" : "전송완료"}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wide ${
                        inv.payment_status === "PAID" 
                          ? "bg-emerald-500 text-white dark:bg-emerald-950/30 dark:text-emerald-400" 
                          : "bg-rose-50 text-rose-600 dark:bg-rose-955/20 dark:text-rose-450"
                      }`}>
                        {inv.payment_status === "PAID" ? "결제완료" : "미결제"}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-xs font-bold text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-850 pt-3 mb-4">
                      <div className="flex justify-between pb-1.5 border-b border-slate-50 dark:border-slate-850/50">
                        <span className="text-slate-400 font-medium">B/L 번호:</span>
                        <span className="text-blue-650 dark:text-blue-400 font-mono">{inv.bl_number || "-"}</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-50 dark:border-slate-850/50">
                        <span className="text-slate-400 font-medium">선박명:</span>
                        <span className="text-slate-700 dark:text-slate-350 max-w-[130px] truncate" title={inv.vessel_name}>{inv.vessel_name}</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-50 dark:border-slate-850/50">
                        <span className="text-slate-400 font-medium">적용 환율:</span>
                        <span className="text-slate-700 dark:text-slate-350">₩{Number(inv.exchange_rate).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-50 dark:border-slate-850/50">
                        <span className="text-slate-400 font-medium">납기일:</span>
                        <span className="text-slate-500 font-mono">{inv.due_date ? inv.due_date.split("T")[0] : "-"}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-indigo-600 dark:text-indigo-400">청구 금액:</span>
                        <span className="text-base font-black text-slate-850 dark:text-slate-100">₩{Number(inv.final_amount_krw).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="flex items-center gap-1.5 justify-end border-t border-slate-50 dark:border-slate-850/50 pt-3 mt-auto">
                    <button 
                      onClick={() => handleOpenDetail(inv)}
                      className="text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 p-2 rounded-lg transition border border-indigo-100 dark:border-indigo-900/50 cursor-pointer"
                      title="청구서 상세 보기"
                    >
                      <Eye size={14} />
                    </button>
                    {user?.role === "admin" && inv.payment_status !== "PAID" && (
                      <button 
                        onClick={() => handlePayInvoice(inv.invoice_no)}
                        className="text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 p-2 rounded-lg transition border border-green-100 dark:border-green-900/50 cursor-pointer"
                        title="결제 완료 처리"
                      >
                        <CheckCircle size={14} />
                      </button>
                    )}
                    {user?.role === "admin" && inv.payment_status !== "PAID" && (
                      <button 
                        onClick={() => handleDeleteInvoice(inv.invoice_no)}
                        className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 p-2 rounded-lg transition border border-red-100 dark:border-red-900/50 cursor-pointer"
                        title="정산서 발행 취소(삭제)"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 데스크탑 테이블 뷰 (큰화면: lg 이상) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] border-b">
                  <tr>
                    {user?.role === "admin" && <th className="p-4 w-12 text-center">선택</th>}
                    <th className="p-4 pl-6">인보이스 번호</th>
                    {user?.role === "admin" && <th className="p-4">화주명</th>}
                    <th className="p-4">B/L 번호</th>
                    <th className="p-4">선박명</th>
                    <th className="p-4 text-right">청구 금액</th>
                    <th className="p-4">적용 환율</th>
                    <th className="p-4">납기일</th>
                    <th className="p-4 text-center">전송 상태</th>
                    <th className="p-4 text-center">결제 상태</th>
                    <th className="p-4 text-center">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold">
                  {filteredInvoices.map((inv: any) => (
                    <tr key={inv.invoice_no} className="hover:bg-slate-50/50 transition">
                      {user?.role === "admin" && (
                        <td className="p-4 text-center">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 cursor-pointer rounded text-indigo-650 accent-indigo-650 border-slate-350"
                            checked={selectedInvoiceNos.includes(inv.invoice_no)}
                            onChange={() => toggleInvoiceSelection(inv.invoice_no)}
                            disabled={inv.publish_status !== 'DRAFT'}
                          />
                        </td>
                      )}
                      <td className="p-4 pl-6 text-slate-800 font-extrabold">{inv.invoice_no}</td>
                      {user?.role === "admin" && <td className="p-4 text-slate-600 font-extrabold">{inv.client_name}</td>}
                      <td className="p-4 text-blue-600 font-mono">{inv.bl_number || "-"}</td>
                      <td className="p-4 text-slate-700 truncate max-w-[140px]" title={inv.vessel_name}>{inv.vessel_name}</td>
                      <td className="p-4 text-right font-black text-slate-800">₩{Number(inv.final_amount_krw).toLocaleString()}</td>
                      <td className="p-4 text-slate-500 font-medium">₩{Number(inv.exchange_rate).toLocaleString()}</td>
                      <td className="p-4 text-slate-400 font-mono">{inv.due_date ? inv.due_date.split("T")[0] : "-"}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                          inv.publish_status === "DRAFT" ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-700"
                        }`}>
                          {inv.publish_status === "DRAFT" ? "임시(DRAFT)" : "전송완료"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                          inv.payment_status === "PAID" ? "bg-emerald-500 text-white dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-rose-50 text-rose-600"
                        }`}>
                          {inv.payment_status === "PAID" ? "완료" : "미결제"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => handleOpenDetail(inv)}
                            className="text-indigo-650 hover:bg-indigo-50 p-1.5 rounded transition border border-indigo-100 cursor-pointer"
                            title="청구서 상세 보기"
                          >
                            <Eye size={13} />
                          </button>
                          {user?.role === "admin" && inv.payment_status !== "PAID" && (
                            <button 
                              onClick={() => handlePayInvoice(inv.invoice_no)}
                              className="text-green-600 hover:bg-green-50 p-1.5 rounded transition border border-green-100 cursor-pointer"
                              title="결제 완료 처리"
                            >
                              <CheckCircle size={13} />
                            </button>
                          )}
                          {user?.role === "admin" && inv.payment_status !== "PAID" && (
                            <button 
                              onClick={() => handleDeleteInvoice(inv.invoice_no)}
                              className="text-red-650 hover:bg-red-50 p-1.5 rounded transition border border-red-100 cursor-pointer"
                              title="정산서 발행 취소(삭제)"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      </div>
      </div>

      {/* Invoice (Debit Note) Detail Viewer Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 h-screen z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-4 overflow-hidden print:static print:block print:bg-white print:p-0 print:overflow-visible print:z-0">
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 10mm !important;
              }
              html, body {
                height: 99% !important;
                overflow: hidden !important;
                background: white !important;
                color: black !important;
                font-size: 12.5px !important;
              }
              /* custom print classes */
              .print-content-area {
                padding: 0 !important;
              }
              .print-content-area > * + * {
                margin-top: 12px !important;
              }
              .print-header {
                padding-bottom: 8px !important;
                margin-bottom: 8px !important;
                gap: 8px !important;
              }
              .print-header h1 {
                font-size: 22px !important;
              }
              .print-box {
                padding: 8px !important;
                gap: 8px !important;
                border-radius: 8px !important;
              }
              .print-table th, .print-table td {
                padding: 6px 7px !important;
                font-size: 11.5px !important;
              }
              .print-summary-box {
                padding: 8px !important;
                border-radius: 8px !important;
                font-size: 11.5px !important;
              }
              .print-summary-box > * + * {
                margin-top: 4px !important;
            }
            @keyframes invoice-slide-up {
              from {
                transform: translateY(100vh);
                opacity: 0.9;
              }
              to {
                transform: translateY(0);
                opacity: 1;
              }
            }
            .animate-invoice-slide-up {
              animation: invoice-slide-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>
          <div className="bg-white rounded-3xl w-full max-w-7xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 my-2 md:my-4 print:transform-none print:translate-y-0 print:my-0 print:h-auto print:w-full print:max-w-full print:shadow-none print:border-none print:rounded-none animate-invoice-slide-up">
            {/* Modal Header (Hidden on Print) */}
            <div className="px-4 py-2.5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <FileText size={20} />
                <h3 className="font-bold text-lg">데빗노트 (Debit Note) 청구 상세</h3>
              </div>
            </div>

            {/* Print Content Area */}
            <div className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1 text-slate-800 print-content-area print:p-0 print:overflow-visible">
              
              {/* Invoice Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b pb-3 print-header">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">DEBIT NOTE</h1>
                  <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Digital Forwarding Hub Services</p>
                  
                  <div className="mt-3 text-xs font-medium text-slate-500 space-y-1">
                    <div>발행처: 주식회사 제로콜 로지스틱스</div>
                    <div>주소: 부산광역시 중구 중앙대로 123 (중앙동)</div>
                    <div>전화: 02-1234-5678 | Email: settlement@zerocall.com</div>
                  </div>
                </div>

                <div className="text-right sm:text-right text-xs font-semibold text-slate-700 space-y-1 bg-slate-50 p-3 rounded-2xl border border-slate-100 min-w-[200px] print-box">
                  <div><span className="text-slate-400">정산 번호:</span> {selectedInvoice.invoice_no}</div>
                  <div><span className="text-slate-400">발행 일자:</span> {selectedInvoice.created_at ? selectedInvoice.created_at.split("T")[0] : "-"}</div>
                  <div><span className="text-slate-400">청구 대상:</span> {selectedInvoice.client_name}</div>
                  <div className="text-red-600 font-bold"><span className="text-slate-400">납기 기한:</span> {selectedInvoice.due_date ? selectedInvoice.due_date.split("T")[0] : "-"}</div>
                </div>
              </div>

              {/* Shipment Details Metadata Box */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-100 text-xs print-box">
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
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm print-box">
                <table className="w-full text-left border-collapse text-xs print-table">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                    <tr>
                      <th className="p-2 pl-3">No.</th>
                      <th className="p-2">차대번호<br />(VIN)</th>
                      <th className="p-2">차종<br />모델명</th>
                      <th className="p-2 text-right">해상운임<br />(USD)</th>
                      <th className="p-2 text-right">고박료<br />(Lashing, KRW)</th>
                      <th className="p-2 text-right">터미널료<br />(THC, KRW)</th>
                      <th className="p-2 text-right">부두사용료<br />(Wharfage, KRW)</th>
                      <th className="p-2 text-right">내륙탁송료<br />(Inland, KRW)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {detailLoading ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center">
                          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        </td>
                      </tr>
                    ) : (
                      invoiceItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition">
                          <td className="p-2 pl-3 text-slate-400 font-bold">{idx + 1}</td>
                          <td className="p-2 font-bold text-slate-800">{item.vin}</td>
                          <td className="p-2">
                            <div className="font-bold text-slate-800">{item.cargo_type}</div>
                            <div className="text-slate-500 text-[10px] mt-0.5 font-normal">{item.model_name}</div>
                          </td>
                          <td className="p-2 text-right font-bold text-slate-700">
                            ${Number(item.applied_ocean_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-right font-bold text-slate-700">
                            ₩{Number(item.applied_lashing_krw).toLocaleString()}
                          </td>
                          <td className="p-2 text-right font-bold text-slate-700">
                            ₩{Number(item.applied_thc_krw).toLocaleString()}
                          </td>
                          <td className="p-2 text-right font-bold text-slate-700">
                            ₩{Number(item.applied_wharfage_krw || 0).toLocaleString()}
                          </td>
                          <td className="p-2 text-right font-bold text-slate-700">
                            ₩{Number(item.applied_inland_krw || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pass-through costs details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 print-box print:border-none print:p-0">
                <div className="p-2 border rounded-xl bg-slate-50 border-slate-100 text-xs font-semibold text-slate-500 flex justify-between print-summary-box">
                  <span>Pass-through 서류비 (B/L Fee):</span>
                  <span className="font-extrabold text-slate-700">₩{Number(selectedInvoice.bl_fee_krw || 40000).toLocaleString()}</span>
                </div>
                <div className="p-2 border rounded-xl bg-slate-50 border-slate-100 text-xs font-semibold text-slate-500 flex justify-between print-summary-box">
                  <span>Pass-through 관세사 수수료 (Customs):</span>
                  <span className="font-extrabold text-slate-700">₩{Number(selectedInvoice.customs_fee_krw || 33000).toLocaleString()}</span>
                </div>
              </div>

              {/* Calculation Summary Breakdowns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 print:gap-2 print:pt-0">
                <div className="text-xs font-semibold text-slate-500 space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 print-summary-box">
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

                <div className="text-xs font-semibold text-slate-500 space-y-1.5 bg-indigo-50/30 p-3.5 rounded-2xl border border-indigo-100/50 print-summary-box">
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
              <div className="border-t pt-4 text-[10px] text-slate-500 text-center font-bold print:pt-3">
                <p>송금 계좌 안내: 부산은행 123-45-678901 (주)제로콜 로지스틱스</p>
                <p className="mt-0.5 text-slate-400 font-medium">※ 기한 내 송금 부탁드리며, 문의사항은 정산팀(02-1234-5678)으로 연락바랍니다.</p>
              </div>

            </div>

            {/* Modal Footer (Hidden on Print) */}
            <div className="px-4 py-2.5 bg-slate-50 border-t flex justify-end gap-3 shrink-0 print:hidden">
              {user?.role === "admin" && selectedInvoice.payment_status !== "PAID" && (
                <button
                  onClick={() => handlePayInvoice(selectedInvoice.invoice_no)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded-xl transition"
                >
                  결제 완료 처리
                </button>
              )}
              {user?.role === "admin" && selectedInvoice.payment_status !== "PAID" && (
                <button
                  onClick={() => handleDeleteInvoice(selectedInvoice.invoice_no)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition"
                >
                  정산서 삭제
                </button>
              )}
              <button
                onClick={printInvoice}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
              >
                <Download size={14} /> PDF 다운로드
              </button>
              <button
                onClick={handleCloseDetail}
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
