import { Bot, GitBranch, Send, Zap } from 'lucide-react';

/**
 * Decorative automation scene rendered AROUND the centered sign-up form: four mini flow-step
 * cards float at the page edges, each joined to the center by a curved dashed connector with a
 * data-dot traveling inward — data converging into the account being created. Pure SVG/CSS
 * (no network assets), pointer-events-none, hidden below lg, and fully static under
 * prefers-reduced-motion (see the auth-scene-* styles in styles.css).
 */

type StepCardProps = {
  icon: React.ReactNode;
  iconClassName: string;
  title: string;
  subtitle: string;
  left: number;
  top: number;
  floatDelay: string;
};

const StepCard = ({
  icon,
  iconClassName,
  title,
  subtitle,
  left,
  top,
  floatDelay,
}: StepCardProps) => (
  <div
    className="auth-scene-float absolute w-[184px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-[0_10px_30px_-10px_rgba(31,41,51,0.18)]"
    style={{ left, top, animationDelay: floatDelay }}
  >
    <div className="flex items-center gap-2.5">
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-tight text-gray-900">
          {title}
        </div>
        <div className="truncate text-[11px] leading-tight text-gray-500">
          {subtitle}
        </div>
      </div>
    </div>
  </div>
);

// Connector paths live in the same 1100x700 coordinate space the cards are placed in, so the
// curves stay visually attached to the card edges at every viewport size.
const CONNECTOR_PATHS = [
  'M 250,146 C 330,146 302,230 338,280',
  'M 850,132 C 772,138 798,222 764,270',
  'M 250,556 C 326,552 302,474 338,430',
  'M 850,564 C 780,564 798,490 764,444',
] as const;

const SignupAutomationScene = () => (
  <div
    className="pointer-events-none absolute inset-0 z-0 hidden select-none lg:block"
    aria-hidden="true"
  >
    <div className="absolute left-1/2 top-1/2 h-[700px] w-[1100px] -translate-x-1/2 -translate-y-1/2">
      {/* Connectors + traveling data-dots */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1100 700"
        fill="none"
      >
        {CONNECTOR_PATHS.map((d) => (
          <path
            key={d}
            d={d}
            className="auth-scene-dash"
            stroke="rgba(31,41,51,0.18)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="3 7"
          />
        ))}
        <g className="auth-scene-motion">
          {CONNECTOR_PATHS.map((d, i) => (
            <circle key={d} r="3.5" fill="hsl(var(--primary))">
              <animateMotion
                dur={`${3.2 + i * 0.55}s`}
                begin={`${i * 0.8}s`}
                repeatCount="indefinite"
                path={d}
              />
            </circle>
          ))}
        </g>
      </svg>

      {/* Flow steps around the form */}
      <StepCard
        icon={<Zap className="h-4 w-4" />}
        iconClassName="bg-amber-50 text-amber-600"
        title="New form response"
        subtitle="Webhook trigger"
        left={64}
        top={118}
        floatDelay="0s"
      />
      <StepCard
        icon={<Bot className="h-4 w-4" />}
        iconClassName="bg-primary/10 text-primary"
        title="Qualify with AI"
        subtitle="AI step"
        left={852}
        top={104}
        floatDelay="-2.3s"
      />
      <StepCard
        icon={<GitBranch className="h-4 w-4" />}
        iconClassName="bg-sky-50 text-sky-600"
        title="Route by score"
        subtitle="Branch"
        left={64}
        top={528}
        floatDelay="-4.1s"
      />
      <StepCard
        icon={<Send className="h-4 w-4" />}
        iconClassName="bg-emerald-50 text-emerald-600"
        title="Notify the team"
        subtitle="Slack message"
        left={852}
        top={536}
        floatDelay="-1.2s"
      />

      {/* Ambient status chips */}
      <div
        className="auth-scene-float absolute flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm"
        style={{ left: 84, top: 332, animationDelay: '-3s' }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="text-[11px] font-medium text-gray-600">
          Run succeeded · 1.2s
        </span>
      </div>
      <div
        className="auth-scene-float absolute flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm"
        style={{ left: 896, top: 338, animationDelay: '-5.2s' }}
      >
        <span className="auth-scene-pulse h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="text-[11px] font-medium text-gray-600">
          2,418 runs this week
        </span>
      </div>
    </div>
  </div>
);

SignupAutomationScene.displayName = 'SignupAutomationScene';

export { SignupAutomationScene };
