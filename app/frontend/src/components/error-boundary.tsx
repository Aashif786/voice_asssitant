import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.message}>
              {this.state.error?.message || "An unexpected error occurred"}
            </Text>
            {this.state.error?.stack ? (
              <Text style={styles.stack}>{this.state.error.stack}</Text>
            ) : null}
          </ScrollView>
          <TouchableOpacity style={styles.button} onPress={this.resetError}>
            <Text style={styles.buttonText}>Try Again</Text>
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
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#05070B",
  },
  scroll: {
    maxHeight: 250,
    width: "100%",
    backgroundColor: "#0D1117",
    borderRadius: 8,
    padding: 12,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: "#1E2633",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F2F5F9",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#FF6B6B",
    marginBottom: 8,
    fontFamily: "monospace",
  },
  stack: {
    fontSize: 11,
    color: "#8B95A4",
    fontFamily: "monospace",
  },
  button: {
    backgroundColor: "#2F7BFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
});
