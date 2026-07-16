import { Request, Response } from 'express';
import axios from 'axios';
import pool from '../config/db';

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  try {
    const [rows]: any = await pool.query(
      'SELECT id, username, role, client_id FROM users WHERE username = ? AND password = ?',
      [username, password]
    );

    if (rows.length > 0) {
      const user = rows[0];
      // 세션에 사용자 정보 저장
      (req.session as any).user = user;
      res.json({ success: true, message: '로그인 성공', user });
    } else {
      res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 잘못되었습니다.' });
    }
  } catch (error) {
    console.error('로그인 에러:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

export const register = async (req: Request, res: Response) => {
  const { username, password, mobile } = req.body;

  try {
    // 중복 사용자 확인
    const [existing]: any = await pool.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '이미 존재하는 사용자 이름입니다.' });
    }

    // mobile 컬럼이 없을 경우를 대비하여 추가 (에러 무시)
    try {
      await pool.query('ALTER TABLE users ADD COLUMN mobile VARCHAR(20)');
    } catch (e) {
      // 이미 존재하면 무시
    }

    // 사용자 추가
    const [result]: any = await pool.query(
      'INSERT INTO users (username, password, role, mobile) VALUES (?, ?, ?, ?)',
      [username, password, 'client', mobile || null]
    );

    res.json({ success: true, message: '회원가입이 완료되었습니다.' });
  } catch (error) {
    console.error('회원가입 에러:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

export const logout = (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: '로그아웃 실패' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: '로그아웃 성공' });
  });
};

export const checkAuth = (req: Request, res: Response) => {
  if ((req.session as any).user) {
    res.json({ success: true, user: (req.session as any).user });
  } else {
    res.status(401).json({ success: false, message: '인증되지 않은 사용자입니다.' });
  }
};

export const kakaoCallback = async (req: Request, res: Response) => {
  const code = req.query.code;
  const REST_API_KEY = process.env.KAKAO_REST_API_KEY;

  // X-Forwarded-Proto, X-Forwarded-Host 헤더를 활용해 동적으로 리다이렉트 URI 및 프론트엔드 주소 계산
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const REDIRECT_URI = `${protocol}://${host}/api/auth/kakao/callback`;

  const frontendUrl = process.env.FRONTEND_URL || 
    (host && host.includes('run.app') 
      ? 'https://forwarding-hub-frontend-269919807885.asia-northeast3.run.app' 
      : 'http://localhost:5173');

  if (!code || !REST_API_KEY) {
    return res.redirect(`${frontendUrl}/login?error=kakao_config_missing`);
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', REST_API_KEY);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('code', code as string);

    const tokenResponse = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      params.toString(),
      { headers: { "Content-type": "application/x-www-form-urlencoded;charset=utf-8" } }
    );
    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    console.log('Kakao User Info:', JSON.stringify(userResponse.data, null, 2));

    const nickname = userResponse.data.properties?.nickname || 
                     userResponse.data.kakao_account?.profile?.nickname || 
                     `kakao_user_${userResponse.data.id}`;

    let [rows]: any = await pool.query('SELECT id, username, role, client_id FROM users WHERE username = ?', [nickname]);
    
    if (rows.length === 0) {
      await pool.query('INSERT INTO users (username, password, role, mobile) VALUES (?, ?, ?, ?)', [nickname, 'kakao_oauth', 'admin', '']);
      [rows] = await pool.query('SELECT id, username, role, client_id FROM users WHERE username = ?', [nickname]);
    }

    const user = rows[0];
    (req.session as any).user = { ...user, kakaoToken: accessToken };

    res.redirect(`${frontendUrl}/`);
  } catch (error: any) {
    console.error('카카오 로그인 에러 상세:', error.response?.data || error.message);
    res.redirect(`${frontendUrl}/login?error=kakao`);
  }
};
