export class ConfirmDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly title: HTMLHeadingElement;
  private readonly message: HTMLParagraphElement;
  private resolve: ((confirmed: boolean) => void) | null = null;

  constructor() {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'confirm-dialog';
    this.dialog.innerHTML = `
      <form method="dialog" class="confirm-dialog__surface">
        <div class="confirm-dialog__copy">
          <h2></h2>
          <p></p>
        </div>
        <div class="confirm-dialog__actions">
          <button class="button button--ghost" value="cancel">Скасувати</button>
          <button class="button button--danger" value="confirm">Видалити</button>
        </div>
      </form>
    `;
    this.title = this.dialog.querySelector('h2') as HTMLHeadingElement;
    this.message = this.dialog.querySelector('p') as HTMLParagraphElement;
    this.dialog.addEventListener('close', () => {
      const confirmed = this.dialog.returnValue === 'confirm';
      this.resolve?.(confirmed);
      this.resolve = null;
    });
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.dialog.close('cancel');
    });
    document.body.appendChild(this.dialog);
  }

  public open(noteTitle: string): Promise<boolean> {
    this.title.textContent = 'Видалити нотатку назавжди?';
    this.message.textContent = `«${noteTitle}» буде видалено без можливості відновлення.`;
    this.dialog.showModal();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  public destroy(): void {
    if (this.dialog.open) this.dialog.close('cancel');
    this.dialog.remove();
  }
}
