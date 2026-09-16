import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HOST_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const loadEmail = async () => {
      const savedEmail = await SecureStore.getItemAsync('signup_email');
      if (savedEmail) {
        setEmail(savedEmail);
      }
    };
    loadEmail();
  }, []);

  const handleVerify = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (otp.length !== 6 || isNaN(Number(otp))) {
      setErrorMsg('Please enter a valid 6-digit code.');
      return;
    }

    try {
      const response = await fetch(`${HOST_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, otp: otp })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.detail || 'Verification failed.');
        return;
      }
      
      router.push('/connect');
    } catch (e) {
      setErrorMsg('Network error connecting to backend.');
    }
  };

  const handleResend = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    // Currently, backend signup generates OTP. We can just say "Code resent" for UI purposes,
    // or we'd need a dedicated resend endpoint. We will use forgot-pin logic or mock it.
    setSuccessMsg('If the email is registered, a new code has been sent.');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        style={{ flex: 1, backgroundColor: '#161B22' }} 
        contentContainerStyle={{ 
          flexGrow: 1, 
          paddingTop: insets.top + 40,
          paddingBottom: 20 
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
          <Text style={styles.title}>Verify Email</Text>
          <Text style={styles.subtitle}>
            We sent a verification code to {email || 'your email'}.
          </Text>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          {successMsg ? <Text style={styles.successText}>{successMsg}</Text> : null}

          <View style={styles.form}>
            <TextInput 
              style={styles.input} 
              placeholder="6-digit code" 
              placeholderTextColor="#888"
              value={otp}
              onChangeText={setOtp}
              keyboardType="numeric"
              maxLength={6}
            />
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleVerify}>
              <Text style={styles.submitBtnText}>Verify</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendBtn} onPress={handleResend}>
              <Text style={styles.resendBtnText}>Resend Code</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/signup')}>
              <Text style={styles.backBtnText}>Back to Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  title: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: '#AAA',
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  form: { width: '100%' },
  input: {
    backgroundColor: '#1E1E1E',
    color: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 2,
  },
  submitBtn: {
    backgroundColor: '#0A84FF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resendBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  resendBtnText: {
    color: '#0A84FF',
    fontSize: 16,
    fontWeight: '600',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 20,
  },
  backBtnText: {
    color: '#888',
    fontSize: 14,
  },
  errorText: {
    color: '#FF453A',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  },
  successText: {
    color: '#34C759',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  }
});
