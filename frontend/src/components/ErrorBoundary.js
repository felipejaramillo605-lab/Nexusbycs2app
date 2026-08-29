import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, diagnosticCode: '' };
  }

  static getDerivedStateFromError() {
    return {
      hasError: true,
      diagnosticCode: `UI-${Date.now().toString(36).toUpperCase()}`
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled UI error', {
      name: error?.name,
      message: error?.message,
      componentStack: errorInfo?.componentStack
    });
  }

  handleRetry = () => window.location.reload();

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500 mb-3">Nexus by CS2</p>
            <h1 className="text-3xl font-light mb-3">No pudimos cargar esta pantalla</h1>
            <p className="text-zinc-400 mb-6">Recarga la página. Si el problema continúa, comparte únicamente el código de diagnóstico con soporte.</p>
            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-400 mb-6">Código: {this.state.diagnosticCode}</div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button type="button" onClick={this.handleRetry} className="h-12 px-5 rounded-xl bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] font-medium transition-colors">Reintentar</button>
              <a href="/login" className="h-12 px-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center font-medium transition-colors">Volver al inicio</a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;