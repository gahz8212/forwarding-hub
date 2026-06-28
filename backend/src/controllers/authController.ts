import { Request, Response } from 'express';
import pool from '../config/db';

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  try {
    const [rows]: any = await pool.query(
      'SELECT id, username, role FROM users WHERE username = ? AND password = ?',
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
