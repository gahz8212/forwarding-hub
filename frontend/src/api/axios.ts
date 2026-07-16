import axios from 'axios';

export const API_BASE_URL = 
  import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL !== ''
    ? import.meta.env.VITE_API_URL
    : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'
        : window.location.origin);

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export default api;
