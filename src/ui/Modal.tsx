export interface ModalSpec {
  title: string;
  body?: React.ReactNode;
  buttons: { label: string; primary?: boolean; onClick(): void }[];
}

export function Modal({ spec, onClose }: { spec: ModalSpec; onClose(): void }) {
  return (
    <div className="modal-back screen-only" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{spec.title}</h3>
        {spec.body}
        <div className="modal-buttons">
          {spec.buttons.map((b, i) => (
            <button
              key={i}
              className={b.primary ? 'primary' : undefined}
              onClick={() => {
                onClose();
                b.onClick();
              }}
            >
              {b.label}
            </button>
          ))}
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
