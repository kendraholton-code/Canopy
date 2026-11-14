/*
 * Schema: one table per Google Sheet tab. Column order here is the column order in the
 * Sheet. The PUBLIC allowlist lives in 40-projection.js — anything not explicitly
 * projected there never leaves the private store.
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var S = (C.schema = {});

  // Editorial status shared by every publishable table.
  S.STATUS = ['pending', 'draft', 'approved', 'unpublished', 'cancelled', 'archived'];
  S.VERIFICATION = ['unverified', 'self_reported', 'verified'];
  S.VISIBILITY = ['public', 'restricted'];

  var EDITORIAL = ['status', 'visibility', 'verification', 'source_ref', 'demo', 'created_at', 'updated_at', 'updated_by', 'approved_by', 'approved_at', 'steward_note'];

  S.tables = {
    Settings: { key: 'key', columns: ['key', 'value', 'notes'] },
    Roles: { key: 'role', columns: ['role', 'label', 'person_name', 'email', 'backup_email', 'notes'] },
    Meetings: {
      prefix: 'mtg',
      columns: ['id', 'date', 'start_time', 'end_time', 'title', 'checkpoint', 'agenda', 'meet_url', 'decision_needed', 'cancelled_reason'].concat(EDITORIAL)
    },
    Recaps: { prefix: 'rcp', columns: ['id', 'meeting_id', 'title', 'summary', 'decisions', 'next_steps'].concat(EDITORIAL) },
    ActionItems: {
      prefix: 'act',
      columns: ['id', 'meeting_id', 'description', 'owner_display', 'due_date', 'progress', 'next_step', 'group_id', 'source_excerpt'].concat(EDITORIAL)
    },
    Organizations: {
      prefix: 'org',
      columns: ['id', 'name', 'description', 'mission', 'website', 'public_email', 'locality', 'service_area', 'interests', 'offers', 'needs', 'logo_url', 'duplicate_of'].concat(EDITORIAL)
    },
    People: {
      prefix: 'per',
      columns: ['id', 'display_name', 'private_email', 'email_norm', 'locality', 'public_contact', 'directory_consent', 'contact_publish_consent', 'updates_consent', 'interests', 'accessibility_notes', 'duplicate_of', 'trusted_publisher', 'publisher_key_hash'].concat(EDITORIAL)
    },
    Affiliations: {
      prefix: 'aff',
      columns: ['id', 'person_id', 'organization_id', 'org_name_reported', 'role_title', 'authorized_to_represent'].concat(EDITORIAL)
    },
    Events: {
      prefix: 'evt',
      columns: [
        'id', 'title', 'organizer', 'organization_id', 'date', 'start_time', 'end_date', 'end_time', 'venue', 'city', 'county', 'online_url', 'source_url',
        'registration_url', 'relevance', 'cost', 'accessibility', 'submitter_name', 'submitter_email', 'manage_token_hash', 'duplicate_of', 'cancelled_reason', 'category', 'published_via'
      ].concat(EDITORIAL)
    },
    Groups: {
      prefix: 'grp',
      columns: [
        'id', 'slot', 'label', 'label_note', 'purpose', 'group_status', 'enrollment_mode', 'intake', 'capacity', 'convenor_display', 'contact_email', 'backup_email',
        'public_contact', 'meet_url', 'notes_url', 'next_gathering', 'time_expectation', 'current_needs', 'welcome_message', 'room_convention'
      ].concat(EDITORIAL)
    },
    Memberships: {
      prefix: 'mem',
      columns: [
        'id', 'person_id', 'group_id', 'state', 'routing', 'routed_to', 'note', 'share_consent', 'source_submission_id', 'withdraw_token_hash', 'respond_token_hash',
        'resolved_by', 'resolved_at', 'created_at', 'updated_at', 'steward_note'
      ]
    },
    Requests: {
      prefix: 'req',
      columns: ['id', 'kind', 'title', 'description', 'owner_display', 'group_id', 'organization_id', 'progress', 'next_step', 'contact_public'].concat(EDITORIAL)
    },
    Updates: {
      prefix: 'upd',
      columns: ['id', 'meeting_id', 'person_id', 'organization_id', 'display_name', 'org_display', 'update_text', 'upcoming_date', 'ask_offer', 'link', 'publish_consent'].concat(EDITORIAL)
    },
    Submissions: {
      prefix: 'sub',
      columns: ['id', 'received_at', 'type', 'client_id', 'email_norm', 'payload_json', 'outcome', 'record_refs', 'processed_at', 'error']
    },
    Consents: { prefix: 'con', columns: ['id', 'person_id', 'kind', 'value', 'text_shown', 'source_submission_id', 'recorded_at'] },
    Notifications: {
      prefix: 'ntf',
      columns: ['id', 'created_at', 'kind', 'to', 'subject', 'body', 'related', 'dedupe_key', 'status', 'attempts', 'last_attempt_at', 'last_error', 'sent_at', 'escalated']
    },
    Corrections: {
      prefix: 'cor',
      columns: ['id', 'received_at', 'record_ref', 'description', 'proposed_changes', 'requester_name', 'requester_email', 'state', 'resolved_by', 'resolved_at', 'steward_note']
    },
    ChangeSets: { prefix: 'chg', columns: ['id', 'created_at', 'title', 'json', 'state', 'preview', 'applied_by', 'applied_at', 'result'] },
    Verification: { prefix: 'ver', columns: ['id', 'name_as_heard', 'context', 'source', 'suggested', 'state', 'steward_note'] },
    Audit: { columns: ['at', 'actor', 'action', 'table', 'record_id', 'details'] }
  };

  S.order = Object.keys(S.tables);

  /** Tables a steward edits that carry editorial status. */
  S.editorial = ['Meetings', 'Recaps', 'ActionItems', 'Organizations', 'People', 'Affiliations', 'Events', 'Groups', 'Requests', 'Updates'];

  /** Tables a change set (e.g. from the monthly Claude workflow) may touch. */
  S.changeSetTables = ['Meetings', 'Recaps', 'ActionItems', 'Organizations', 'Affiliations', 'Events', 'Groups', 'Requests', 'Updates', 'Verification'];

  /** Fields a submitter may propose changing through a correction. */
  S.correctable = {
    Events: ['title', 'organizer', 'date', 'start_time', 'end_date', 'end_time', 'venue', 'city', 'county', 'online_url', 'source_url', 'registration_url', 'relevance', 'cost', 'accessibility', 'category'],
    Organizations: ['name', 'description', 'mission', 'website', 'public_email', 'locality', 'service_area', 'interests', 'offers', 'needs', 'logo_url'],
    People: ['display_name', 'locality', 'public_contact', 'interests'],
    Requests: ['title', 'description', 'next_step', 'contact_public'],
    Groups: ['purpose', 'current_needs', 'time_expectation', 'next_gathering', 'public_contact'],
    Recaps: ['summary', 'decisions', 'next_steps'],
    ActionItems: ['description', 'owner_display', 'due_date', 'progress', 'next_step']
  };

  S.columns = function (table) {
    var t = S.tables[table];
    if (!t) throw new Error('Unknown table: ' + table);
    return t.columns;
  };

  S.keyOf = function (table) {
    return S.tables[table].key || 'id';
  };

  /** Role keys used for routing. Unassigned roles are honest gaps, never defaulted to a person. */
  S.ROLES = [
    ['intake_steward', 'Welcomes people with no group yet and handles general interest'],
    ['events_steward', 'Reviews community-calendar submissions'],
    ['directory_steward', 'Reviews organization and people listings'],
    ['facilitator', 'Receives monthly updates and prepares the agenda'],
    ['facilitator_backup', 'Backup facilitator'],
    ['communications_steward', 'Corrections, recap distribution and reminders'],
    ['exceptions_steward', 'Receives failed-delivery and unassigned-item alerts'],
    ['technical_support', 'Bounded setup and exceptional troubleshooting']
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
