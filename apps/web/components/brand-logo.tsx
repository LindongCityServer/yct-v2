'use client';

import { useId, type SVGProps } from 'react';

/**
 * 雨城通品牌标识。
 *
 * 直接内联 SVG，并用 --yct-brand-light / --yct-brand-deep 填充，
 * 强调色切换时由 CSS 变量即时改色，不依赖 filter 对 <img> SVG 的支持，
 * 也能避免浏览器/PWA 缓存旧图片样式造成的“颜色不变”。
 */
export function BrandWordmark(props: SVGProps<SVGSVGElement>) {
  const uid = useId().replace(/:/g, '');
  const clipSymbol = `${uid}-clip-symbol`;
  const gradientA = `${uid}-gradient-a`;
  const gradientB = `${uid}-gradient-b`;
  const clipLetterOne = `${uid}-clip-letter-one`;
  const clipLetterTwo = `${uid}-clip-letter-two`;
  const clipLetterThree = `${uid}-clip-letter-three`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      width={280}
      height={72}
      viewBox="0 0 280 72"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <clipPath id={clipSymbol}>
          <rect x={14} y={6} width={60} height={60} rx={0} />
        </clipPath>
        <linearGradient x1={0} y1={0.5} x2={1} y2={0.5} id={gradientA}>
          <stop offset="0%" stopColor="var(--yct-brand-deep, #0e8384)" stopOpacity={1} />
          <stop offset="100%" stopColor="var(--yct-brand-deep, #0e8384)" stopOpacity={0} />
        </linearGradient>
        <linearGradient x1={0} y1={0.5} x2={1} y2={0.5} id={gradientB}>
          <stop offset="0%" stopColor="var(--yct-brand-deep, #0e8384)" stopOpacity={1} />
          <stop offset="100%" stopColor="var(--yct-brand-deep, #0e8384)" stopOpacity={0} />
        </linearGradient>
        <clipPath id={clipLetterOne}>
          <rect x={86} y={8.999998092651367} width={54} height={54.000003814697266} rx={0} />
        </clipPath>
        <clipPath id={clipLetterTwo}>
          <rect x={149} y={8.999998092651367} width={54} height={54.000003814697266} rx={0} />
        </clipPath>
        <clipPath id={clipLetterThree}>
          <rect x={212} y={8.999998092651367} width={54} height={54.000003814697266} rx={0} />
        </clipPath>
      </defs>
      <g>
        <g clipPath={`url(#${clipSymbol})`}>
          <g>
            <rect
              x={64}
              y={18}
              width={10}
              height={10}
              rx={0}
              fill="var(--yct-brand-light, #32c5c7)"
              fillOpacity={1}
            />
          </g>
          <g>
            <rect
              x={14}
              y={18}
              width={36}
              height={10}
              rx={0}
              fill="var(--yct-brand-light, #32c5c7)"
              fillOpacity={1}
            />
          </g>
          <g transform="matrix(0,1,-1,0,66,-6)">
            <rect
              x={36}
              y={30}
              width={36}
              height={10}
              rx={0}
              fill={`url(#${gradientA})`}
              fillOpacity={1}
            />
          </g>
          <g transform="matrix(0,1,-1,0,42,-30)">
            <rect
              x={36}
              y={6}
              width={10}
              height={10}
              rx={0}
              fill="var(--yct-brand-deep, #0e8384)"
              fillOpacity={1}
            />
          </g>
          <g>
            <rect
              x={14}
              y={44}
              width={10}
              height={10}
              rx={0}
              fill="var(--yct-brand-light, #32c5c7)"
              fillOpacity={1}
            />
          </g>
          <g>
            <rect
              x={38}
              y={44}
              width={36}
              height={10}
              rx={0}
              fill="var(--yct-brand-light, #32c5c7)"
              fillOpacity={1}
            />
          </g>
          <g transform="matrix(0,1,-1,0,118,-6)">
            <rect
              x={62}
              y={56}
              width={10}
              height={10}
              rx={0}
              fill="var(--yct-brand-deep, #0e8384)"
              fillOpacity={1}
            />
          </g>
          <g transform="matrix(0,-1,-1,0,103,103)">
            <rect
              x={62}
              y={41}
              width={35}
              height={10}
              rx={0}
              fill={`url(#${gradientB})`}
              fillOpacity={1}
            />
          </g>
        </g>
        <g>
          <g clipPath={`url(#${clipLetterOne})`}>
            <g>
              <path
                d="M116.25,14.999998092651367L140,14.999998092651367L140,8.999998092651367L86,8.999998092651367L86,14.999998092651367L110.25,14.999998092651367L110.25,21.499998092651367L86,21.499998092651367L86,62.99999809265137L92,62.99999809265137L92,27.499998092651367L110.25,27.499998092651367L110.25,62.99999809265137L116.25,62.99999809265137L116.25,27.499998092651367L134,27.499998092651367L134,56.99999809265137L125.5,56.99999809265137L125.5,62.99999809265137L140,62.99999809265137L140,21.499998092651367L116.25,21.499998092651367L116.25,14.999998092651367ZM96,38.99999809265137L106.5,38.99999809265137L106.5,32.99999809265137L96,32.99999809265137L96,38.99999809265137ZM130.5,32.99999809265137L120,32.99999809265137L120,38.99999809265137L130.5,38.99999809265137L130.5,32.99999809265137ZM106.5,45.99999809265137L96,45.99999809265137L96,51.99999809265137L106.5,51.99999809265137L106.5,45.99999809265137ZM130.5,45.99999809265137L120,45.99999809265137L120,51.99999809265137L130.5,51.99999809265137L130.5,45.99999809265137Z"
                fillRule="evenodd"
                fill="var(--yct-brand-deep, #0e8384)"
                fillOpacity={1}
              />
            </g>
          </g>
          <g clipPath={`url(#${clipLetterTwo})`}>
            <g>
              <path
                d="M189.7797,62.99999809265137L202.5,62.99999809265137L202.5,56.99999809265137L195.2203,56.99999809265137L194.8021,52.73479809265137L202.78,51.986898092651366L202.22,46.01309809265137L194.2167,46.763398092651364L192.3281,27.499998092651367L202.5,27.499998092651367L202.5,21.499998092651367L191.7399,21.499998092651367L190.4857,8.707284092651367L184.5143,9.292712092651367L185.7111,21.499998092651367L167,21.499998092651367L167,62.99999809265137L173,62.99999809265137L173,38.74999809265137L178,38.74999809265137L178,51.49999809265137L175,51.49999809265137L175,57.49999809265137L184,57.49999809265137L184,32.74999809265137L173,32.74999809265137L173,27.499998092651367L186.29930000000002,27.499998092651367L188.2428,47.32349809265137L186.22,47.51309809265137L186.78,53.486898092651366L188.8283,53.294898092651366L189.7797,62.99999809265137ZM160.25,21.499998092651367L160.25,8.999998092651367L154.25,8.999998092651367L154.25,21.499998092651367L149,21.499998092651367L149,27.499998092651367L154.25,27.499998092651367L154.25,56.99999809265137L149,56.99999809265137L149,62.99999809265137L165.5,62.99999809265137L165.5,56.99999809265137L160.25,56.99999809265137L160.25,27.499998092651367L165.5,27.499998092651367L165.5,21.499998092651367L160.25,21.499998092651367ZM194,14.999998092651367L202.5,14.999998092651367L202.5,8.999998092651367L194,8.999998092651367L194,14.999998092651367Z"
                fillRule="evenodd"
                fill="var(--yct-brand-deep, #0e8384)"
                fillOpacity={1}
              />
            </g>
          </g>
          <g clipPath={`url(#${clipLetterThree})`}>
            <g>
              <path
                d="M223.5,8.999998092651367L212,8.999998092651367L212,14.999998092651367L223.5,14.999998092651367L223.5,8.999998092651367ZM244.5,47.31249809265137L244.5,54.99999809265137L250.5,54.99999809265137L250.5,47.31249809265137L260,47.31249809265137L260,54.99999809265137L266,54.99999809265137L266,22.249998092651367L250.5,22.249998092651367L250.5,22.137798092651366L266,20.137768092651367L266,8.999998092651367L229.5,8.999998092651367L229.5,14.999998092651367L258.9323,14.999998092651367L244.5,16.862228092651367L244.5,22.249998092651367L229,22.249998092651367L229,54.99999809265137L235,54.99999809265137L235,47.31249809265137L244.5,47.31249809265137ZM250.5,41.31249809265137L260,41.31249809265137L260,37.62499809265137L250.5,37.62499809265137L250.5,41.31249809265137ZM244.5,37.62499809265137L244.5,41.31249809265137L235,41.31249809265137L235,37.62499809265137L244.5,37.62499809265137ZM250.5,31.624998092651367L260,31.624998092651367L260,28.249998092651367L250.5,28.249998092651367L250.5,31.624998092651367ZM244.5,28.249998092651367L244.5,31.624998092651367L235,31.624998092651367L235,28.249998092651367L244.5,28.249998092651367ZM220.51547,61.56249809265137L211.618031,63.43559809265137L210.381969,57.564398092651366L217.5,56.06579809265137L217.5,27.499998092651367L212,27.499998092651367L212,21.499998092651367L223.5,21.499998092651367L223.5,56.040598092651365L230.7971,57.49999809265137L266,57.49999809265137L266,63.49999809265137L230.2029,63.49999809265137L220.51547,61.56249809265137Z"
                fillRule="evenodd"
                fill="var(--yct-brand-deep, #0e8384)"
                fillOpacity={1}
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

export function BrandSymbol(props: SVGProps<SVGSVGElement>) {
  const uid = useId().replace(/:/g, '');
  const clip = `${uid}-clip`;
  const gradientA = `${uid}-gradient-a`;
  const gradientB = `${uid}-gradient-b`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      width={60}
      height={60}
      viewBox="0 0 60 60"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={0} y={0} width={60} height={60} rx={0} />
        </clipPath>
        <linearGradient x1={0} y1={0.5} x2={1} y2={0.5} id={gradientA}>
          <stop offset="0%" stopColor="var(--yct-brand-deep, #0e8384)" stopOpacity={1} />
          <stop offset="100%" stopColor="var(--yct-brand-deep, #0e8384)" stopOpacity={0} />
        </linearGradient>
        <linearGradient x1={0} y1={0.5} x2={1} y2={0.5} id={gradientB}>
          <stop offset="0%" stopColor="var(--yct-brand-deep, #0e8384)" stopOpacity={1} />
          <stop offset="100%" stopColor="var(--yct-brand-deep, #0e8384)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <g>
          <rect
            x={50}
            y={12}
            width={10}
            height={10}
            rx={0}
            fill="var(--yct-brand-light, #32c5c7)"
            fillOpacity={1}
          />
        </g>
        <g>
          <rect
            x={0}
            y={12}
            width={36}
            height={10}
            rx={0}
            fill="var(--yct-brand-light, #32c5c7)"
            fillOpacity={1}
          />
        </g>
        <g transform="matrix(0,1,-1,0,46,2)">
          <rect
            x={22}
            y={24}
            width={36}
            height={10}
            rx={0}
            fill={`url(#${gradientA})`}
            fillOpacity={1}
          />
        </g>
        <g transform="matrix(0,1,-1,0,22,-22)">
          <rect
            x={22}
            y={0}
            width={10}
            height={10}
            rx={0}
            fill="var(--yct-brand-deep, #0e8384)"
            fillOpacity={1}
          />
        </g>
        <g>
          <rect
            x={0}
            y={38}
            width={10}
            height={10}
            rx={0}
            fill="var(--yct-brand-light, #32c5c7)"
            fillOpacity={1}
          />
        </g>
        <g>
          <rect
            x={24}
            y={38}
            width={36}
            height={10}
            rx={0}
            fill="var(--yct-brand-light, #32c5c7)"
            fillOpacity={1}
          />
        </g>
        <g transform="matrix(0,1,-1,0,98,2)">
          <rect
            x={48}
            y={50}
            width={10}
            height={10}
            rx={0}
            fill="var(--yct-brand-deep, #0e8384)"
            fillOpacity={1}
          />
        </g>
        <g transform="matrix(0,-1,-1,0,83,83)">
          <rect
            x={48}
            y={35}
            width={35}
            height={10}
            rx={0}
            fill={`url(#${gradientB})`}
            fillOpacity={1}
          />
        </g>
      </g>
    </svg>
  );
}
