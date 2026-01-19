import { useEffect, useRef } from "react";
import styles from "./CursorDiv.module.css";

export default function CursorDiv({
  children,
  liveTime = 1000,
  initialX,
  initialY,
  className,
}: {
  children: React.ReactNode;
  liveTime?: number;
  initialX?: number;
  initialY?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Устанавливаем начальную позицию
    if (ref.current && initialX !== undefined && initialY !== undefined) {
      ref.current.style.left = initialX + "px";
      ref.current.style.top = initialY + "px";
    }
  }, [initialX, initialY]);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      if (ref.current) {
        ref.current.remove();
      }
    }, liveTime);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [liveTime]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (ref.current) {
        ref.current.style.left = e.clientX + "px";
        ref.current.style.top = e.clientY + "px";
      }
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  return (
    <div ref={ref} className={`${styles.cursorDiv} ${className}`}>
      {children}
    </div>
  );
}
