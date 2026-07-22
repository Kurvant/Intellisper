import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type DataTableCheckboxProps = {
  label: string;
  checked: boolean;
  handleCheckedChange: (checked: boolean) => void;
};

export function DataTableInputCheckbox({
  label,
  checked,
  handleCheckedChange,
}: DataTableCheckboxProps) {
  // NOTE: this is a role="button" div, not a <button>. The inner <Checkbox> is a Radix
  // <button role="checkbox">, and a <button> may not nest inside a <button> (invalid DOM +
  // hydration error). A styled, keyboard-accessible div gives the same look/behavior safely.
  const toggle = () => handleCheckedChange(!checked);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={checked}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'flex items-center space-x-2 border-dashed rounded-md px-3 py-2 h-9 cursor-pointer',
        'hover:bg-accent/5',
        checked && 'bg-accent/10 border-accent text-accent-foreground',
      )}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <Checkbox checked={checked} className="pointer-events-none" />
      <Label className="text-sm font-normal leading-none select-none cursor-pointer">
        {label}
      </Label>
    </div>
  );
}
