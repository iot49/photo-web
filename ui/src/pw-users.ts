import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

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
}

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

  override connectedCallback() {
    super.connectedCallback();
    this.fetchUsers();
  }

  private async fetchUsers() {
    this.loading = true;
    this.error = '';

    try {
      // Try HTTPS first, fallback to HTTP for development
      let response;
      try {
        response = await fetch('/auth/users', {
          method: 'GET',
          credentials: 'include',
          mode: 'cors',
        });
      } catch (httpsError) {
        console.warn('HTTPS request failed, trying HTTP:', httpsError);
        response = await fetch('/auth/users', {
          method: 'GET',
          credentials: 'include',
          mode: 'cors',
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status} ${response.statusText}`);
      }

      this.users = await response.json();
    } catch (error) {
      console.error('Error fetching users:', error);
      this.error = error instanceof Error ? error.message : 'Failed to fetch users';
    } finally {
      this.loading = false;
    }
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

    try {
      const response = await fetch(`/auth/users/${this.editingUser.email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        mode: 'cors',
        body: JSON.stringify(this.editForm),
      });

      if (!response.ok) {
        throw new Error(`Failed to update user: ${response.status} ${response.statusText}`);
      }

      // Refresh the users list
      await this.fetchUsers();
      this.cancelEdit();
    } catch (error) {
      console.error('Error updating user:', error);
      this.error = error instanceof Error ? error.message : 'Failed to update user';
    }
  }

  private async deleteUser(user: User) {
    if (!confirm(`Are you sure you want to delete user "${user.name}" (${user.email})?`)) {
      return;
    }

    try {
      const response = await fetch(`/auth/users/${user.email}`, {
        method: 'DELETE',
        credentials: 'include',
        mode: 'cors',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete user: ${response.status} ${response.statusText}`);
      }

      // Refresh the users list
      await this.fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      this.error = error instanceof Error ? error.message : 'Failed to delete user';
    }
  }

  private handleFormInput(field: keyof User, event: Event) {
    const target = event.target as HTMLInputElement;
    const value = field === 'enabled' ? target.checked : target.value;
    this.editForm = { ...this.editForm, [field]: value };
  }

  private formatLastLogin(lastLogin: string): string {
    if (!lastLogin) return 'Never';
    try {
      return new Date(lastLogin).toLocaleString();
    } catch {
      return lastLogin;
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
        <td class="email">${user.email}</td>
        <td class="roles">
          ${isEditing
            ? html`
                <input
                  type="text"
                  .value=${this.editForm.roles || ''}
                  @input=${(e: Event) => this.handleFormInput('roles', e)}
                  class="edit-input"
                  placeholder="e.g., public,admin"
                />
              `
            : html` <span class="roles-list">${user.roles}</span> `}
        </td>
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
        <td class="last-login">${this.formatLastLogin(user.last_login)}</td>
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
            <button @click=${this.fetchUsers}>Retry</button>
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
        <div class="container">
          <h2>User Management</h2>

          <table class="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Enabled</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.users
                .filter(user => this.editingUser?.email === user.email)
                .map(user => this.renderUserRow(user, true))}
              ${this.users
                .filter(user => this.editingUser?.email !== user.email)
                .map(user => this.renderUserRow(user, false))}
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

    .last-login {
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
      padding: 0.25rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 0.875rem;
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
      .last-login {
        display: none;
      }

      .user-avatar {
        width: 24px;
        height: 24px;
      }
    }
  `;
}
