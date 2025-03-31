import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const API_BASE_URL = 'https://echo-trails-backend.vercel.app'; // Replace with your actual backend URL

export interface AudioUploadParams {
  audioUri: string;
  latitude: number;
  longitude: number;
  title?: string;
  range?: number;
  hiddenUntil?: Date;
}

export const uploadAudioFile = async ({
  audioUri, 
  latitude, 
  longitude, 
  title = 'Untitled Note',
  range = 1000, // Default range in meters
  hiddenUntil = new Date(Date.now()) // Default: hidden for 24 hours
}: AudioUploadParams) => {
  try {
    // Get the access token from secure storage
    const accessToken = await AsyncStorage.getItem('accessToken');
    
    if (!accessToken) {
      throw new Error('No access token found');
    }
    console.log("accesstoken:",accessToken)
    // Create form data
    const formData = new FormData();
    // Prepare file for upload
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    const fileName = fileInfo.uri.split('/').pop() || 'audio.m4a';
    console.log("filename:",fileName)
    console.log("fileinfo:",fileInfo)
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a', // Adjust mime type based on your recording format
      name: fileName
    } as any);

    // Add additional form fields
    formData.append('title', title);
    formData.append('latitude', latitude.toString());
    formData.append('longitude', longitude.toString());
    formData.append('range', range.toString());
    
    // Add hidden until date
    formData.append('hidden_until', hiddenUntil.toISOString());
    console.log("formdata",formData)

    // Perform the upload
    const response = await axios.post(`${API_BASE_URL}/audio/upload/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    return response.data; // Returns { id: string }
  } catch (error) {
    console.error('Audio upload failed:', error);
    
    // Improve error handling
    if (axios.isAxiosError(error)) {
      Alert.alert(
        'Upload Failed', 
        error.response?.data?.detail || 'Could not upload audio file'
      );
    } else {
      Alert.alert('Upload Failed', 'An unexpected error occurred');
    }
    
    throw error;
  }
};