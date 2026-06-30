import React from "react";
import { Download, CreditCard, CheckCircle, AlertCircle } from "lucide-react";

export default function InvoiceListPage() {
  const mockInvoices = [
    {
      invoiceNo: "INV-2026-081",
      blNumber: "KMTC1234",
      vesselName: "KMTC NAGOYA",
      amount: 1450,
      dueDate: "2026-07-15",
      isPaid: false,
    },
    {
      invoiceNo: "INV-2026-079",
      blNumber: "KMTC9999",
      vesselName: "KMTC SHANGHAI",
      amount: 2100,
      dueDate: "2026-06-25",
      isPaid: true,
    },
  ];

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-400">이번 달 청구 금액</p>
            <p className="text-2xl font-black text-slate-800 mt-1">$3,550</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <CreditCard size={24} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-400">미결제 금액 (Unpaid)</p>
            <p className="text-2xl font-black text-red-600 mt-1">$1,450</p>
          </div>
          <div className="p-3 bg-red-50 text-red-500 rounded-xl">
            <AlertCircle size={24} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-400">결제 완료 금액</p>
            <p className="text-2xl font-black text-green-600 mt-1">$2,100</p>
          </div>
          <div className="p-3 bg-green-50 text-green-500 rounded-xl">
            <CheckCircle size={24} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">청구서 리스트</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-4 font-bold">인보이스 번호</th>
                <th className="p-4 font-bold">B/L 번호</th>
                <th className="p-4 font-bold">선박명</th>
                <th className="p-4 font-bold text-right">청구 금액</th>
                <th className="p-4 font-bold">납기일</th>
                <th className="p-4 font-bold text-center">결제 상태</th>
                <th className="p-4 font-bold text-center">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockInvoices.map((inv) => (
                <tr key={inv.invoiceNo} className="hover:bg-slate-50 transition">
                  <td className="p-4 font-bold text-slate-800">{inv.invoiceNo}</td>
                  <td className="p-4 text-blue-600 font-semibold">{inv.blNumber}</td>
                  <td className="p-4 text-slate-800 font-medium">{inv.vesselName}</td>
                  <td className="p-4 text-right font-bold text-slate-800">${inv.amount.toLocaleString()}</td>
                  <td className="p-4 text-slate-500 text-sm">{inv.dueDate}</td>
                  <td className="p-4 text-center">
                    {inv.isPaid ? (
                      <span className="inline-block px-2.5 py-1 rounded text-xs font-bold bg-green-50 text-green-600 border border-green-200">
                        완료
                      </span>
                    ) : (
                      <span className="inline-block px-2.5 py-1 rounded text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                        미결제
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <button className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg border border-slate-200 hover:border-slate-300 transition">
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
