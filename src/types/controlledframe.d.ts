declare namespace JSX {
  interface IntrinsicElements {
    controlledframe: React.DetailedHTMLProps<
      React.IframeHTMLAttributes<HTMLIFrameElement> & {
        partition?: string
        allowtransparency?: string
        autosize?: string
      },
      HTMLIFrameElement
    >
  }
} 