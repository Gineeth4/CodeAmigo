import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const VIEWFINDER_SIZE = width * 0.7;

export default function ConnectScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const storedRole = await AsyncStorage.getItem('@user_designation');

        const host = await SecureStore.getItemAsync('host');
        const sessionToken = await SecureStore.getItemAsync('session_token');
        if (host && sessionToken) {
          const response = await fetch(`${host}/handshake`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_token: sessionToken })
          });
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
              router.replace({ pathname: '/chat', params: { designation: storedRole || 'Developer' } } as any);
              return;
            }
          }
        }
      } catch (error) {
        // Fall through to show camera
      }
      await SecureStore.deleteItemAsync('host');
      await SecureStore.deleteItemAsync('session_token');
      setIsInitializing(false);
    };
    checkExistingSession();
  }, []);

  useEffect(() => {
    if (!isInitializing && permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, isInitializing]);

  const handleBarCodeScanned = async ({ type, data }: { type: string, data: string }) => {
    if (scanned || connecting) return;
    setScanned(true);

    try {
      const payload = JSON.parse(data);
      if (!payload.host || !payload.session_token) {
        throw new Error("Invalid QR code format.");
      }
      
      setConnecting(true);

      const response = await fetch(`${payload.host}/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: payload.session_token })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          await SecureStore.setItem('host', payload.host);
          await SecureStore.setItem('session_token', payload.session_token);
          const storedRole = await AsyncStorage.getItem('@user_designation');
          // Navigate to next screen upon successful lockdown
          router.push({ pathname: '/chat', params: { designation: storedRole || 'Developer' } } as any);
        } else {
          Alert.alert("Connection Failed", data.detail || "Server rejected connection.");
          setScanned(false);
          setConnecting(false);
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        Alert.alert("Connection Failed", errData.detail || "Server rejected connection.");
        setScanned(false);
        setConnecting(false);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to parse QR code.");
      setScanned(false);
      setConnecting(false);
    }
  };

  if (isInitializing || !permission) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#0A84FF" /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.instructions}>Camera permission is required to scan the pairing QR code.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.instructions}>
        Start the CodeAmigo backend on your laptop and scan the QR code to pair securely.
      </Text>
      
      <View style={styles.cameraWrapper}>
        <CameraView
          style={styles.camera}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
        />
        
        {/* Square Viewfinder Overlay */}
        <View style={styles.overlay}>
          <View style={styles.unfocusedContainer} />
          <View style={styles.middleContainer}>
            <View style={styles.unfocusedContainer} />
            <View style={styles.focusedContainer}>
              {connecting && <ActivityIndicator size="large" color="#0A84FF" />}
            </View>
            <View style={styles.unfocusedContainer} />
          </View>
          <View style={styles.unfocusedContainer} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  instructions: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  cameraWrapper: {
    width: width,
    height: width, // makes it square container
    overflow: 'hidden',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  unfocusedContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  middleContainer: {
    flexDirection: 'row',
    height: VIEWFINDER_SIZE,
  },
  focusedContainer: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
    borderWidth: 2,
    borderColor: '#0A84FF',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
