import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

export const downloadAndShareFile = async (url: string, filename: string) => {
    try {
        const fileUri = FileSystem.documentDirectory + filename;
        const downloadRes = await FileSystem.downloadAsync(url, fileUri);
        
        if (downloadRes.status !== 200) {
            throw new Error('Failed to download file from server');
        }
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(downloadRes.uri);
        } else {
            Alert.alert("Success", "File downloaded successfully, but sharing is not supported on this device.");
        }
    } catch (e: any) {
        console.error("Download Error:", e);
        Alert.alert("Download Error", "Could not download the file. Please try again.");
    }
};
