import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("Dashboard Error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "24px",
          color: "#666",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          textAlign: "center"
        }}>
          <h2 style={{ marginBottom: "12px" }}>Something went wrong</h2>
          <p style={{ fontSize: "14px" }}>Please refresh the page or try again later.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
