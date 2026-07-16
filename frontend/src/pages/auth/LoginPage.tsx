import api, { API_BASE_URL } from '../../api/axios';
import React from "react";
import axios from "axios";
import { useAuthStore } from "../../store/useAuthStore";
import { Anchor } from "lucide-react";

export default function LoginPage() {
  const [isLogin, setIsLogin] = React.useState(true);
  const [username, setUsername] = React.useState("shipper");
  const [password, setPassword] = React.useState("shipper123");
  const [mobile, setMobile] = React.useState("");
  const { setUser } = useAuthStore();
  const [error, setError] = React.useState("");
  const [successMsg, setSuccessMsg] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    try {
      if (isLogin) {
        const response = await api.post("/api/auth/login",
          {
            username,
            password,
          },
          { withCredentials: true }
        );

        if (response.data.success) {
          setUser(response.data.user);
        }
      } else {
        const response = await api.post("/api/auth/register",
          {
            username,
            password,
            mobile,
          }
        );

        if (response.data.success) {
          setSuccessMsg("회원가입이 완료되었습니다. 로그인해주세요.");
          setIsLogin(true);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || (isLogin ? "로그인 실패" : "회원가입 실패"));
    }
  };

  const handleKakaoLogin = () => {
    const kakaoKey = import.meta.env.VITE_KAKAO_REST_API_KEY || "7a6dcc4ac0f82a1c7f84c4f0506c7312";
    // 반드시 현재 도메인(Nginx 프록시)을 통해 콜백을 받아야 세션 쿠키 도메인이 일치
    const redirectUri = `${window.location.origin}/api/auth/kakao/callback`;
    const KAKAO_AUTH_URL = `https://kauth.kakao.com/oauth/authorize?client_id=${kakaoKey}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=talk_message,profile_nickname`;
    window.location.href = KAKAO_AUTH_URL;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 font-sans">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-2xl shadow-xl w-96 border border-slate-100"
      >
        <div className="flex items-center justify-center gap-2 text-blue-600 mb-6">
          <Anchor size={32} />
          <h2 className="text-2xl font-black tracking-tight text-slate-800">
            Forwarding Hub
          </h2>
        </div>

        {error && (
          <p className="text-red-500 mb-4 text-sm text-center font-medium bg-red-50 py-1.5 rounded">{error}</p>
        )}
        {successMsg && (
          <p className="text-green-500 mb-4 text-sm text-center font-medium bg-green-50 py-1.5 rounded">{successMsg}</p>
        )}

        <div className="mb-4">
          <label className="block text-sm font-bold text-slate-700 mb-1">
            Username
          </label>
          <input
            type="text"
            className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 transition"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-bold text-slate-700 mb-1">
            Password
          </label>
          <input
            type="password"
            className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {!isLogin && (
          <div className="mb-6">
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Mobile (휴대전화)
            </label>
            <input
              type="tel"
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 transition"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="010-0000-0000"
              required
            />
          </div>
        )}
        <button
          type="submit"
          className={`w-full text-white py-2.5 rounded-lg font-bold transition shadow-sm ${isLogin ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
            }`}
        >
          {isLogin ? "로그인" : "회원가입"}
        </button>

        <p className="mt-4 text-sm text-center text-slate-500">
          {isLogin ? "계정이 없으신가요? " : "이미 계정이 있으신가요? "}
          <button
            type="button"
            className="text-blue-600 font-bold hover:underline"
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
              setSuccessMsg("");
            }}
          >
            {isLogin ? "회원가입" : "로그인"}
          </button>
        </p>

        <div className="relative flex py-4 items-center">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-4 text-slate-400 text-xs font-semibold">간편 로그인</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        <button
          type="button"
          onClick={handleKakaoLogin}
          className="w-full bg-[#FEE500] text-[#191919] py-2.5 rounded-lg font-bold hover:bg-[#FDD800] transition flex items-center justify-center gap-2 shadow-sm"
        >
          {/* Simple yellow circle to mimic Kakao icon */}
          <span className="w-2.5 h-2.5 bg-amber-900 rounded-full"></span>
          카카오로 3초 만에 시작하기
        </button>
      </form>
    </div>
  );
}
