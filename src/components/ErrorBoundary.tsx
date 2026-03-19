import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.log('ErrorBoundary caught:', error.message, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>The app encountered an error during rendering.</Text>
          <ScrollView style={styles.scrollBox} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.errorText}>{this.state.error?.message}</Text>
            <Text style={styles.stackText}>{this.state.error?.stack?.slice(0, 1000)}</Text>
            {this.state.errorInfo?.componentStack && (
              <Text style={styles.stackText}>
                {this.state.errorInfo.componentStack.slice(0, 500)}
              </Text>
            )}
          </ScrollView>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => this.setState({ hasError: false, error: null, errorInfo: null })}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141414',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#F5F5F5', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#8C8C8C', textAlign: 'center', marginBottom: 20 },
  scrollBox: {
    maxHeight: 300,
    width: '100%',
    backgroundColor: '#1F1F1F',
    borderRadius: 12,
    marginBottom: 20,
  },
  scrollContent: { padding: 16 },
  errorText: { fontSize: 14, fontWeight: '600', color: '#FF4D4F', marginBottom: 12 },
  stackText: { fontSize: 11, color: '#8C8C8C', lineHeight: 16 },
  retryBtn: {
    backgroundColor: '#1890FF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  retryText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
