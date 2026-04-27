import React, { useState } from 'react';
import './EmailTemplates.css';

function EmailTemplates() {
  const [templates, setTemplates] = useState([
    {
      id: 1,
      name: 'Welcome Email',
      subject: 'Welcome to CTS BPO, {client_name}!',
      body: 'Hello {client_name},\n\nWelcome to CTS BPO! We\'re excited to work with you.\n\nYour account has been set up and you can log in at:\nhttps://cts-bpo-frontend.onrender.com\n\nBest regards,\nCTS BPO Team',
      category: 'onboarding',
      variables: ['{client_name}', '{email}', '{date}']
    },
    {
      id: 2,
      name: 'Quote Email',
      subject: 'Your Quote - {project_name}',
      body: 'Hello {client_name},\n\nPlease find your quote below:\n\nProject: {project_name}\nValue: {amount_zar}\nDeadline: {deadline}\n\nPlease review and let us know if you have any questions.\n\nBest regards,\nCTS BPO Team',
      category: 'quotes',
      variables: ['{client_name}', '{project_name}', '{amount_zar}', '{deadline}']
    },
    {
      id: 3,
      name: 'Invoice Email',
      subject: 'Invoice {invoice_number}',
      body: 'Hello {client_name},\n\nPlease find your invoice attached.\n\nInvoice Number: {invoice_number}\nAmount: {amount_zar}\nDue Date: {due_date}\n\nPayment methods available:\n- Ozow: {ozow_link}\n- PayPal: {paypal_link}\n\nThank you for your business!\n\nBest regards,\nCTS BPO Team',
      category: 'invoicing',
      variables: ['{client_name}', '{invoice_number}', '{amount_zar}', '{due_date}']
    },
    {
      id: 4,
      name: 'Payment Confirmation',
      subject: 'Payment Received - Thank You!',
      body: 'Hello {client_name},\n\nWe\'ve received your payment of {amount_zar}.\n\nTransaction Reference: {reference}\nDate: {date}\n\nYour work is now in progress. We\'ll update you soon.\n\nBest regards,\nCTS BPO Team',
      category: 'payments',
      variables: ['{client_name}', '{amount_zar}', '{reference}', '{date}']
    },
    {
      id: 5,
      name: 'Completion Notification',
      subject: 'Your Project Is Complete!',
      body: 'Hello {client_name},\n\nGood news! Your project is complete.\n\nProject: {project_name}\nCompleted Date: {completion_date}\n\nYou can now download your deliverables from your dashboard.\n\nThank you for choosing CTS BPO!\n\nBest regards,\nCTS BPO Team',
      category: 'completion',
      variables: ['{client_name}', '{project_name}', '{completion_date}']
    }
  ]);

  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);
  const [editMode, setEditMode] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleEdit = (template) => {
    setEditMode(true);
    setEditedTemplate({ ...template });
    setShowPreview(false);
  };

  const handleSave = () => {
    setTemplates(templates.map(t => t.id === editedTemplate.id ? editedTemplate : t));
    setSelectedTemplate(editedTemplate);
    setEditMode(false);
    setEditedTemplate(null);
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditedTemplate(null);
  };

  const handlePreview = () => {
    setShowPreview(!showPreview);
  };

  const handleFieldChange = (field, value) => {
    setEditedTemplate({ ...editedTemplate, [field]: value });
  };

  const getPreviewText = (text) => {
    if (!text) return '';
    return text
      .replace(/{client_name}/g, 'John Doe')
      .replace(/{email}/g, 'john@example.com')
      .replace(/{project_name}/g, 'Data Entry Project')
      .replace(/{amount_zar}/g, 'R 15,000')
      .replace(/{deadline}/g, '2026-05-15')
      .replace(/{invoice_number}/g, 'INV-001')
      .replace(/{due_date}/g, '2026-05-31')
      .replace(/{ozow_link}/g, 'pay.ozow.com')
      .replace(/{paypal_link}/g, 'paypal.me')
      .replace(/{reference}/g, 'TXN-12345')
      .replace(/{date}/g, '2026-04-27')
      .replace(/{completion_date}/g, '2026-04-26');
  };

  return (
    <div className="email-templates-container">
      <div className="email-templates-header">
        <h1>📧 Email Templates Manager</h1>
        <p>Customize emails for every business scenario</p>
      </div>

      <div className="email-templates-layout">
        {/* Left Sidebar - Template List */}
        <div className="template-list-sidebar">
          <h3>Templates</h3>
          <div className="template-categories">
            {['onboarding', 'quotes', 'invoicing', 'payments', 'completion'].map(category => (
              <div key={category} className="category-group">
                <h4>{category.charAt(0).toUpperCase() + category.slice(1)}</h4>
                {templates.filter(t => t.category === category).map(template => (
                  <div
                    key={template.id}
                    className={`template-item ${selectedTemplate?.id === template.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setEditMode(false);
                    }}
                  >
                    {template.name}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content - Template Editor */}
        <div className="template-editor">
          {!editMode ? (
            <>
              {/* View Mode */}
              <div className="template-view">
                <div className="template-view-header">
                  <h2>{selectedTemplate.name}</h2>
                  <div className="template-view-actions">
                    <button className="btn-preview" onClick={handlePreview}>
                      {showPreview ? '👁️ Hide Preview' : '👁️ Preview'}
                    </button>
                    <button className="btn-edit" onClick={() => handleEdit(selectedTemplate)}>
                      ✏️ Edit
                    </button>
                  </div>
                </div>

                <div className="template-details">
                  <div className="detail-group">
                    <label>Subject Line:</label>
                    <p className="subject-line">{selectedTemplate.subject}</p>
                  </div>

                  <div className="detail-group">
                    <label>Email Body:</label>
                    <div className={`email-body ${showPreview ? 'preview-mode' : ''}`}>
                      {showPreview ? (
                        <div className="preview-content">
                          {getPreviewText(selectedTemplate.body)}
                        </div>
                      ) : (
                        <pre>{selectedTemplate.body}</pre>
                      )}
                    </div>
                  </div>

                  <div className="detail-group">
                    <label>Available Variables (copy & paste into template):</label>
                    <div className="variables-list">
                      {selectedTemplate.variables.map((variable, idx) => (
                        <span key={idx} className="variable-tag">{variable}</span>
                      ))}
                    </div>
                  </div>

                  <div className="template-info">
                    <span className="category-badge">{selectedTemplate.category}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Edit Mode */}
              <div className="template-edit">
                <div className="edit-header">
                  <h2>Editing: {editedTemplate.name}</h2>
                  <div className="edit-actions">
                    <button className="btn-save" onClick={handleSave}>
                      💾 Save Changes
                    </button>
                    <button className="btn-cancel" onClick={handleCancel}>
                      ❌ Cancel
                    </button>
                  </div>
                </div>

                <div className="edit-form">
                  <div className="form-group">
                    <label htmlFor="template-name">Template Name:</label>
                    <input
                      id="template-name"
                      type="text"
                      value={editedTemplate.name}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      placeholder="e.g., Welcome Email"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="template-subject">Subject Line:</label>
                    <input
                      id="template-subject"
                      type="text"
                      value={editedTemplate.subject}
                      onChange={(e) => handleFieldChange('subject', e.target.value)}
                      placeholder="e.g., Welcome to CTS BPO, {client_name}!"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="template-body">Email Body:</label>
                    <textarea
                      id="template-body"
                      value={editedTemplate.body}
                      onChange={(e) => handleFieldChange('body', e.target.value)}
                      placeholder="Write your email. Use variables like {client_name}, {amount_zar}, etc."
                      rows="12"
                    />
                  </div>

                  <div className="form-group">
                    <label>Quick Variables (click to insert):</label>
                    <div className="quick-variables">
                      {editedTemplate.variables.map((variable, idx) => (
                        <button
                          key={idx}
                          className="quick-var-btn"
                          onClick={() => {
                            const textarea = document.getElementById('template-body');
                            textarea.value += variable;
                            handleFieldChange('body', textarea.value);
                          }}
                        >
                          {variable}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div className="template-help">
        <h3>💡 Tips For Email Templates</h3>
        <ul>
          <li>Use variables like <code>{'{client_name}'}</code> to make emails personal</li>
          <li>Variables are automatically filled when the email is sent</li>
          <li>Keep subject lines under 50 characters for mobile</li>
          <li>Use {'{deadline}'} for project deadlines</li>
          <li>Use {'{amount_zar}'} or {'{amount_usd}'} for amounts</li>
          <li>Professional tone = better client relationships!</li>
        </ul>
      </div>
    </div>
  );
}

export default EmailTemplates;