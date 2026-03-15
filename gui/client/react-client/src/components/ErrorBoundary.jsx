import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      resetCounter: 0,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[UI Error Boundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState((current) => ({
      hasError: false,
      error: null,
      resetCounter: current.resetCounter + 1,
    }));
  };

  render() {
    const {
      children,
      title = 'Section unavailable',
      message = 'Something went wrong while rendering this section.',
    } = this.props;

    if (this.state.hasError) {
      return (
        <section className="error-boundary glass" role="alert" aria-live="assertive">
          <h2 className="error-boundary-title">{title}</h2>
          <p className="error-boundary-message">{message}</p>
          <button type="button" className="btn-secondary error-boundary-action" onClick={this.handleReset}>
            Retry section
          </button>
        </section>
      );
    }

    return <React.Fragment key={this.state.resetCounter}>{children}</React.Fragment>;
  }
}

export default ErrorBoundary;