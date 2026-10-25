import type { Goal } from '../types';
import { getGoals, saveGoal, deleteGoal, getAllSettings } from '../db';
import { todayISO } from '../utils/dates';
import { icon } from '../utils/icons';

let onChangeCallback: (() => void) | null = null;

export function setGoalsOnChange(cb: () => void): void {
  onChangeCallback = cb;
}

const GOAL_COLORS = ['#7c6ff7', '#4ade80', '#f97316', '#60a5fa', '#f472b6', '#fbbf24', '#34d399'];

export async function renderGoals(container: HTMLElement): Promise<void> {
  const [goals, settings] = await Promise.all([getGoals(), getAllSettings()]);
  const sym = settings.currencySymbol ?? '$';

  const cardsHTML = goals.length === 0
    ? `<div class="empty-state">
         <div class="empty-icon">${icon('target', { size: 32 })}</div>
         <p>No savings goals yet</p>
       </div>`
    : goals.map(g => renderGoalCard(g, sym)).join('');

  container.innerHTML = `
    <div class="goals-screen">
      <div class="screen-header">
        <h2>Savings Goals</h2>
      </div>

      <div class="goals-list">
        ${cardsHTML}
      </div>

      <button class="btn-primary" id="new-goal-btn">+ New Goal</button>

      <div class="goal-form" id="goal-form" hidden>
        <div class="field-group">
          <label class="field-label">Goal name</label>
          <input class="text-input" id="goal-name" type="text" placeholder="e.g. Emergency Fund" />
        </div>
        <div class="field-group">
          <label class="field-label">Target amount</label>
          <input class="text-input" id="goal-target" type="number" inputmode="decimal" min="0" step="1" placeholder="1000" />
        </div>
        <div class="field-group">
          <label class="field-label">Target date (optional)</label>
          <input class="text-input" id="goal-date" type="date" />
        </div>
        <div class="field-group">
          <label class="field-label">Color</label>
          <div class="color-swatches" id="goal-colors">
            ${GOAL_COLORS.map((c, i) => `
              <button class="color-swatch${i === 0 ? ' active' : ''}" data-color="${c}" style="background:${c}"></button>
            `).join('')}
          </div>
        </div>
        <button class="btn-primary" id="save-goal-btn">Save Goal</button>
        <button class="btn-secondary" id="cancel-goal-btn">Cancel</button>
        <div class="save-error" id="goal-error"></div>
      </div>
    </div>`;

  bindGoalEvents(container);
}

function renderGoalCard(g: Goal, sym: string): string {
  const pct = g.targetAmount > 0 ? Math.min((g.currentAmount / g.targetAmount) * 100, 100) : 0;
  const complete = g.currentAmount >= g.targetAmount && g.targetAmount > 0;
  let hint = '';
  if (g.targetDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(g.targetDate + 'T00:00:00');
    const days = Math.round((target.getTime() - today.getTime()) / 86400000);
    hint = days >= 0 ? `${days} day${days === 1 ? '' : 's'} left` : `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  }

  return `
    <div class="goal-card" data-id="${g.id}">
      <div class="goal-top">
        <span class="goal-dot" style="background:${g.color}"></span>
        <span class="goal-name">${g.name}${complete ? ' ✓' : ''}</span>
        <div class="goal-actions">
          <button class="action-btn goal-edit" data-id="${g.id}" title="Edit">${icon('edit', { size: 16 })}</button>
          <button class="action-btn goal-delete" data-id="${g.id}" title="Delete">${icon('trash', { size: 16 })}</button>
        </div>
      </div>
      <div class="goal-amounts">
        <span class="goal-current">${sym}${g.currentAmount.toFixed(2)}</span>
        <span class="goal-target">of ${sym}${g.targetAmount.toFixed(2)}</span>
      </div>
      <div class="budget-bar">
        <div class="budget-bar-fill" style="width:${pct}%;background:${g.color}"></div>
      </div>
      <div class="goal-sub">
        <span>${pct.toFixed(0)}%</span>
        ${hint ? `<span class="goal-hint">${hint}</span>` : ''}
      </div>
      <button class="btn-outline goal-contribute" data-id="${g.id}">+ Contribute</button>
    </div>`;
}

let editingGoalId: string | null = null;
let selectedColor = GOAL_COLORS[0];

function bindGoalEvents(container: HTMLElement): void {
  const form = container.querySelector('#goal-form') as HTMLElement;

  container.querySelector('#new-goal-btn')?.addEventListener('click', () => {
    editingGoalId = null;
    selectedColor = GOAL_COLORS[0];
    resetForm(container);
    form.hidden = false;
    (container.querySelector('#new-goal-btn') as HTMLElement).hidden = true;
    form.scrollIntoView({ behavior: 'smooth' });
  });

  container.querySelector('#cancel-goal-btn')?.addEventListener('click', () => {
    form.hidden = true;
    (container.querySelector('#new-goal-btn') as HTMLElement).hidden = false;
    editingGoalId = null;
  });

  container.querySelectorAll('#goal-colors .color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      container.querySelectorAll('#goal-colors .color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      selectedColor = (sw as HTMLElement).dataset.color ?? GOAL_COLORS[0];
    });
  });

  container.querySelector('#save-goal-btn')?.addEventListener('click', () => saveGoalForm(container));

  container.querySelectorAll('.goal-contribute').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      const goals = await getGoals();
      const goal = goals.find(g => g.id === id);
      if (!goal) return;
      const input = prompt(`Add contribution to "${goal.name}":`, '');
      if (input === null) return;
      const amount = parseFloat(input);
      if (isNaN(amount) || amount <= 0) return;
      goal.currentAmount += amount;
      goal.contributions = [...(goal.contributions ?? []), { date: todayISO(), amount }];
      await saveGoal(goal);
      await renderGoals(container);
      onChangeCallback?.();
    });
  });

  container.querySelectorAll('.goal-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      const goals = await getGoals();
      const goal = goals.find(g => g.id === id);
      if (!goal) return;
      editingGoalId = id;
      selectedColor = goal.color;
      form.hidden = false;
      (container.querySelector('#new-goal-btn') as HTMLElement).hidden = true;
      (container.querySelector('#goal-name') as HTMLInputElement).value = goal.name;
      (container.querySelector('#goal-target') as HTMLInputElement).value = String(goal.targetAmount);
      (container.querySelector('#goal-date') as HTMLInputElement).value = goal.targetDate ?? '';
      container.querySelectorAll('#goal-colors .color-swatch').forEach(s => {
        s.classList.toggle('active', (s as HTMLElement).dataset.color === goal.color);
      });
      form.scrollIntoView({ behavior: 'smooth' });
    });
  });

  container.querySelectorAll('.goal-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      if (confirm('Delete this goal? Its saved progress will be removed.')) {
        await deleteGoal(id);
        await renderGoals(container);
        onChangeCallback?.();
      }
    });
  });
}

function resetForm(container: HTMLElement): void {
  (container.querySelector('#goal-name') as HTMLInputElement).value = '';
  (container.querySelector('#goal-target') as HTMLInputElement).value = '';
  (container.querySelector('#goal-date') as HTMLInputElement).value = '';
  container.querySelectorAll('#goal-colors .color-swatch').forEach((s, i) => {
    s.classList.toggle('active', i === 0);
  });
}

async function saveGoalForm(container: HTMLElement): Promise<void> {
  const name = (container.querySelector('#goal-name') as HTMLInputElement).value.trim();
  const target = parseFloat((container.querySelector('#goal-target') as HTMLInputElement).value);
  const date = (container.querySelector('#goal-date') as HTMLInputElement).value;
  const errorEl = container.querySelector('#goal-error') as HTMLElement;

  errorEl.textContent = '';
  if (!name) { errorEl.textContent = 'Please enter a name.'; return; }
  if (isNaN(target) || target <= 0) { errorEl.textContent = 'Please enter a target amount.'; return; }

  const goals = await getGoals();
  if (editingGoalId) {
    const existing = goals.find(g => g.id === editingGoalId);
    if (existing) {
      await saveGoal({ ...existing, name, targetAmount: target, targetDate: date || undefined, color: selectedColor });
    }
  } else {
    await saveGoal({
      id: crypto.randomUUID(),
      name,
      targetAmount: target,
      currentAmount: 0,
      color: selectedColor,
      targetDate: date || undefined,
      order: goals.length,
      createdAt: new Date().toISOString(),
      contributions: [],
    });
  }

  editingGoalId = null;
  await renderGoals(container);
  onChangeCallback?.();
}
