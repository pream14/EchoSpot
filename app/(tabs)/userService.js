// userService.js
import axios from 'axios';

/**
 * Fetches the list of users that the current user is following
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} - Promise that resolves to an array of following users
 */
const API_URL = 'https://echo-trails-backend.vercel.app'; 
export const getFollowingUsers = async (token) => {
  try {
    const response = await axios.get(`${API_URL}/users/following`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching following users:', error);
    throw error;
  }
};