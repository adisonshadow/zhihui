import './yimanGenLoader.css';

export function YimanGenLoaderOverlay({ className }: { className?: string }) {
  return (
    <div className={['yiman-gen-loader-overlay', className].filter(Boolean).join(' ')}>
      <div className="yiman-gen-loader-spinner">
        <div className="yiman-gen-loader-inner yiman-gen-loader-inner-one" />
        <div className="yiman-gen-loader-inner yiman-gen-loader-inner-two" />
        <div className="yiman-gen-loader-inner yiman-gen-loader-inner-three" />
      </div>
    </div>
  );
}
