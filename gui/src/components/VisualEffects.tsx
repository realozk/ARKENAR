import { useEffect, useRef, memo } from "react";

interface Star {
    x: number;
    y: number;
    size: number;
    opacity: number;
    speed: number;
}

interface StarfieldProps {
    isScanning?: boolean;
    theme?: string;
}

export const Starfield = memo(({ isScanning, theme }: StarfieldProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const scanningRef = useRef(isScanning);
    const themeRef = useRef(theme);

    useEffect(() => {
        scanningRef.current = isScanning;
    }, [isScanning]);

    useEffect(() => {
        themeRef.current = theme;
    }, [theme]);

    // Imperatively update canvas opacity when theme changes
    // (avoids re-rendering Starfield via JSX on every parent update)
    useEffect(() => {
        if (!canvasRef.current) return;
        canvasRef.current.style.opacity = theme === 'light' ? '0.88' : '0.40';
    }, [theme]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;
        let stars: Star[] = [];
        let speedMultiplier = 1;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initStars();
        };

        const initStars = () => {
            const count = Math.floor((canvas.width * canvas.height) / 8000);
            stars = Array.from({ length: count }, () => ({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 1.5 + 0.5,
                opacity: Math.random() * 0.5 + 0.2,
                speed: Math.random() * 0.15 + 0.05,
            }));
        };

        const draw = () => {
            const isScanning = scanningRef.current;
            const targetMultiplier = isScanning ? 12 : 1;

            // Smoother braking (0.007 instead of 0.01) for a cinematic deceleration
            const easing = (targetMultiplier < speedMultiplier) ? 0.007 : 0.02;
            speedMultiplier += (targetMultiplier - speedMultiplier) * easing;

            // Maintain low alpha during deceleration so trails fade out over time
            const isInSlowdown = !isScanning && speedMultiplier > 1.2;
            const clearAlpha = (isScanning || isInSlowdown) ? 0.3 : 0.85;

            // Canvas background adapts to theme
            const isLight = themeRef.current === 'light';
            // Light mode: clear with the actual html bg so panel transparency works right
            const bgR = isLight ? 216 : 0;
            const bgG = isLight ? 218 : 0;
            const bgB = isLight ? 226 : 0;
            // Light mode: lower alpha = trails linger longer, stars pop more
            const lightClearAlpha = (isScanning || isInSlowdown) ? 0.20 : 0.65;
            const effectiveClearAlpha = isLight ? lightClearAlpha : clearAlpha;
            ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${effectiveClearAlpha})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Stars: near-black on light theme for strong contrast, white on dark themes
            const starColor = isLight ? '15, 15, 35' : '255, 255, 255';

            stars.forEach((star) => {
                const opacity = star.opacity;
                const size = star.size;
                const currentSpeed = star.speed * speedMultiplier;

                ctx.fillStyle = `rgba(${starColor}, ${opacity})`;
                ctx.beginPath();
                const stretch = currentSpeed * 1.0;
                ctx.rect(star.x, star.y, size, size + stretch);
                ctx.fill();

                star.y -= currentSpeed;
                if (star.y < 0) {
                    star.y = canvas.height;
                    star.x = Math.random() * canvas.width;
                }

                if (speedMultiplier < 1.5) {
                    star.opacity += (Math.random() - 0.5) * 0.01;
                    // Light mode: keep stars in a higher opacity range so they're clearly visible
                    const minOp = isLight ? 0.55 : 0.1;
                    const maxOp = isLight ? 0.95 : 0.7;
                    star.opacity = Math.max(minOp, Math.min(maxOp, star.opacity));
                }
            });

            animationFrameId = requestAnimationFrame(draw);
        };

        window.addEventListener("resize", resize);
        resize();
        draw();

        return () => {
            window.removeEventListener("resize", resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-1000"
            style={{
                filter: "blur(0.5px)",
            }}
        />
    );
});

export const Aurora = memo(() => {
    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-30 select-none">
            <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-accent/10 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-status-info/5 blur-[100px] animate-pulse" style={{ animationDuration: '12s' }} />
        </div>
    );
});
