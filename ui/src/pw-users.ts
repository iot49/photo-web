import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { get_json, put_json, delete_json } from './app/api';

/**
 * User interface matching the auth service User model
 */
interface User {
  id: number;
  name: string;
  email: string;
  roles: string;
  enabled: boolean;
  uuid: string;
  picture: string;
  last_login: string;
  terms_accepted: string;
  created_at: string;
}

// BUG: editing roles a) does not allow to choose any roles, b) clears all existing roles

/**
 * User management component that shows all users with editable fields
 */
@customElement('pw-users')
export class PwUsers extends LitElement {
  @state()
  private users: User[] = [];

  @state()
  private loading = false;

  @state()
  private error = '';

  @state()
  private editingUser: User | null = null;

  @state()
  private editForm: Partial<User> = {};

  @state()
  private folderOptions: string[] = [];

  @state()
  private showDetails = false;

  override async connectedCallback() {
    super.connectedCallback();
    this.users = await get_json('/auth/users');
    this.folderOptions = await get_json('/files/api/folders');
  }

  private startEdit(user: User) {
    this.editingUser = user;
    this.editForm = {
      name: user.name,
      roles: user.roles,
      enabled: user.enabled,
    };
  }

  private cancelEdit() {
    this.editingUser = null;
    this.editForm = {};
  }

  private async saveEdit() {
    if (!this.editingUser) return;

    const url = `/auth/users/${this.editingUser.email}`;
    
    const result = await put_json(url, this.editForm);
    if (result) {
      // Refresh the users list
      this.users = await get_json('/auth/users');
      this.cancelEdit();
      window.dispatchEvent(new CustomEvent('pw-me-changed'));
      
      // Show message about cache refresh if roles were updated
      if (this.editForm.roles !== undefined) {
        alert('User roles updated successfully! Please refresh the page or re-login to see the updated permissions.');
      }
    } else {
      this.error = 'Failed to update user';
    }
  }

  private async deleteUser(user: User) {
    if (!confirm(`Are you sure you want to delete user "${user.name}" (${user.email})?`)) {
      return;
    }

    const result = await delete_json(`/auth/users/${user.email}`);
    if (result) {
      // Refresh the users list
      this.users = await get_json('/auth/users');
    } else {
      this.error = 'Failed to delete user';
    }
  }

  private handleFormInput(field: keyof User, event: Event) {
    const target = event.target as HTMLInputElement;
    const value = field === 'enabled' ? target.checked : target.value;
    this.editForm = { ...this.editForm, [field]: value };
  }

  private handleSelectInput(field: keyof User, event: CustomEvent) {
    // For sl-select with multiple, event.detail.value should be an array
    let selectedOptions = event.detail.value as string[] | undefined;
    
    // Fallback: if event.detail.value is undefined, try to get value from target
    if (!selectedOptions) {
      const target = event.target as any;
      selectedOptions = target.value;
    }
    
    
    // Convert back to comma-separated string for storage (our backend expects comma-separated)
    // Also convert underscore values back to original folder names with spaces
    const value = selectedOptions && Array.isArray(selectedOptions)
      ? selectedOptions.map(option => {
          // Check if this is a sanitized folder option and convert back to original
          const originalFolder = this.folderOptions.find(folder => folder.replace(/\s+/g, '_') === option);
          return originalFolder || option;
        }).join(',')
      : '';
    
    this.editForm = { ...this.editForm, [field]: value };
  }

  private toggleDetails() {
    this.showDetails = !this.showDetails;
  }

  private formatDate(dateString: string, defaultText: string = 'Unknown'): string {
    if (!dateString) return defaultText;
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  }

  private renderUserRow(user: User, isEditing: boolean) {
    return html`
      <tr data-user-email="${user.email}">
        <td class="name">
          ${isEditing
            ? html`
                <input
                  type="text"
                  .value=${this.editForm.name || ''}
                  @input=${(e: Event) => this.handleFormInput('name', e)}
                  class="edit-input"
                />
              `
            : html`
                <div class="user-info">
                  ${user.picture ? html`<img src="${user.picture}" alt="${user.name}" class="user-avatar" />` : ''}
                  <span>${user.name}</span>
                </div>
              `}
        </td>
        <td class="email">
          ${user.email}
        </td>
        ${this.showDetails || isEditing ? html`
          <td class="roles">
            ${isEditing
              ? html`
                  <sl-select
                    multiple
                    clearable
                    hoist
                    placeholder="Select roles"
                    .value=${this.editForm.roles ? this.editForm.roles.split(',').filter(r => r.trim()).map(role => {
                      // Convert folder names with spaces to underscore format for sl-select
                      return this.folderOptions.includes(role.replace(/_/g, ' ')) ? role.replace(/\s+/g, '_') : role;
                    }) : []}
                    @sl-change=${(e: CustomEvent) => {
                      this.handleSelectInput('roles', e);
                    }}
                  >
                    ${(() => {
                      // Combine hardcoded roles with folder options, using Set to remove duplicates
                      const hardcodedRoles = ['public', 'protected', 'private', 'admin', 'editor'];
                      const allOptions = [...new Set([...hardcodedRoles, ...this.folderOptions])];
                      
                      return allOptions.map(option => {
                        // Replace spaces with underscores for the value, but keep original for display
                        const sanitizedValue = option.replace(/\s+/g, '_');
                        return html`<sl-option value=${sanitizedValue}>${option}</sl-option>`;
                      });
                    })()}
                  </sl-select>
                `
              : html` <span class="roles-list">${user.roles.replace(/,/g, ' ')}</span> `}
          </td>
        ` : ''}
        ${this.showDetails || isEditing ? html`
          <td class="enabled">
            ${isEditing
              ? html`
                  <input
                    type="checkbox"
                    .checked=${this.editForm.enabled || false}
                    @change=${(e: Event) => this.handleFormInput('enabled', e)}
                    class="edit-checkbox"
                  />
                `
              : html` <span class="badge ${user.enabled ? 'enabled' : 'disabled'}"> ${user.enabled ? 'Enabled' : 'Disabled'} </span> `}
          </td>
        ` : ''}
        <td class="last-login">
          ${user.last_login
            ? html`<sl-relative-time date="${user.last_login}"></sl-relative-time>`
            : 'Never'}
        </td>
        ${this.showDetails ? html`<td class="terms-accepted">${this.formatDate(user.terms_accepted, 'Not accepted')}</td>` : ''}
        <td class="created-at">${this.formatDate(user.created_at)}</td>
        <td class="actions">
          ${isEditing
            ? html`
                <button @click=${this.saveEdit} class="save-btn">Save</button>
                <button @click=${this.cancelEdit} class="cancel-btn">Cancel</button>
              `
            : html`
                <button @click=${() => this.startEdit(user)} class="edit-btn">Edit</button>
                <button @click=${() => this.deleteUser(user)} class="delete-btn">Delete</button>
              `}
        </td>
      </tr>
    `;
  }

  override render() {
    if (this.loading) {
      return html`
        <div class="container">
          <div class="loading">Loading users...</div>
        </div>
      `;
    }

    if (this.error) {
      return html`
        <div class="container">
          <div class="error">
            <p>Error: ${this.error}</p>
            <button @click=${async (_: any) => this.users = await get_json('/auth/users')}>Retry</button>
          </div>
        </div>
      `;
    }

    if (this.users.length === 0) {
      return html`
        <div class="container">
          <div class="empty">
            <p>No users found.</p>
          </div>
        </div>
      `;
    }

    return html`
      <pw-nav-page>
        <div slot="nav-controls" class="header-controls">
          <sl-switch
            .checked=${this.showDetails}
            @sl-change=${() => this.toggleDetails()}
          >
            Show details
          </sl-switch>
        </div>
        
        <div class="container">
          <h2>User Management</h2>

          <table class="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                ${this.showDetails || this.editingUser ? html`<th>Roles</th>` : ''}
                ${this.showDetails || this.editingUser ? html`<th>Enabled</th>` : ''}
                <th>Last Login</th>
                ${this.showDetails ? html`<th>Terms</th>` : ''}
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.users.map(user =>
                this.renderUserRow(user, this.editingUser?.email === user.email)
              )}
            </tbody>
          </table>
        </div>
      </pw-nav-page>
    `;
  }

  static styles = css`
    :host {
      display: block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .container {
      padding: 1rem;
      max-width: 100%;
      overflow-x: auto;
    }

    h2 {
      margin: 0 0 1rem 0;
      color: #333;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .loading,
    .error,
    .empty {
      text-align: center;
      padding: 2rem;
      color: #666;
    }

    .error {
      color: #d32f2f;
    }

    .error button {
      margin-top: 1rem;
      padding: 0.5rem 1rem;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .error button:hover {
      background: #1565c0;
    }

    .users-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .users-table th,
    .users-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
      /* Allow dropdowns to overflow table cells */
      overflow: visible;
    }

    .users-table th {
      background: #f5f5f5;
      font-weight: 600;
      color: #333;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .users-table tbody tr:hover {
      background: #f9f9f9;
    }

    .users-table tbody tr:last-child td {
      border-bottom: none;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
    }

    .name {
      font-weight: 500;
      min-width: 150px;
    }

    .email {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.875rem;
      color: #666;
      min-width: 200px;
    }

    .roles-list {
      font-size: 0.875rem;
      color: #666;
      min-width: 25ch; /* Minimum width of 25 characters */
      max-width: 30ch; /* Limit width to 30 characters */
      white-space: normal; /* Allow text to wrap */
      display: inline-block; /* Ensure max-width works */
      vertical-align: middle; /* Align with other inline elements */
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge.enabled {
      background: #e8f5e8;
      color: #2e7d32;
    }

    .badge.disabled {
      background: #ffebee;
      color: #c62828;
    }

    .last-login,
    .terms-accepted,
    .created-at {
      font-size: 0.875rem;
      color: #666;
      min-width: 120px;
    }

    .actions {
      white-space: nowrap;
    }

    .edit-btn,
    .delete-btn,
    .save-btn,
    .cancel-btn {
      padding: 0.25rem 0.5rem;
      margin: 0 0.25rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 500;
      transition: background-color 0.2s ease;
    }

    .edit-btn {
      background: #1976d2;
      color: white;
    }

    .edit-btn:hover {
      background: #1565c0;
    }

    .delete-btn {
      background: #d32f2f;
      color: white;
    }

    .delete-btn:hover {
      background: #c62828;
    }

    .save-btn {
      background: #2e7d32;
      color: white;
    }

    .save-btn:hover {
      background: #1b5e20;
    }

    .cancel-btn {
      background: #757575;
      color: white;
    }

    .cancel-btn:hover {
      background: #616161;
    }

    .edit-input {
      width: 100%;
      font-size: 0.875rem;
    }

    .edit-input {
      padding: 0.25rem;
      border: 1px solid #ccc;
      border-radius: 4px;
    }

    .edit-input:focus {
      outline: none;
      border-color: #1976d2;
      box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
    }



    .edit-checkbox {
      transform: scale(1.2);
    }


    @media (max-width: 768px) {
      .container {
        padding: 0.5rem;
      }

      .users-table {
        font-size: 0.875rem;
      }

      .users-table th,
      .users-table td {
        padding: 0.5rem;
      }

      /* Hide less important columns on mobile */
      .last-login,
      .terms-accepted,
      .created-at {
        display: none;
      }

      .user-avatar {
        width: 24px;
        height: 24px;
      }
    }
  `;
}
