import axios from 'axios';
import Constants from 'expo-constants';

const BASE_URL = 'https://your-flask-api.com'; // Replace with your actual API URL

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for authentication
api.interceptors.request.use(async (config) => {
  const token = await getToken(); // Implement this using expo-secure-store
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});