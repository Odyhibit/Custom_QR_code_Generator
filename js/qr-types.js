// QR Code Type Formatters
// Handles formatting for 8 different QR code content types

const QRTypes = {
    // Type definitions with field configurations
    types: {
        text: {
            name: 'Text',
            icon: 'text',
            description: 'Plain text message',
            fields: [
                { name: 'text', label: 'Text', type: 'textarea', placeholder: 'Enter any text...', required: true }
            ],
            format: (data) => {
                return data.text || '';
            }
        },

        url: {
            name: 'URL',
            icon: 'link',
            description: 'Website link',
            fields: [
                { name: 'url', label: 'Website URL', type: 'url', placeholder: 'https://example.com', required: true }
            ],
            format: (data) => {
                if (!data.url) return '';
                let url = data.url.trim();
                // Add https:// if no protocol specified
                if (url && !url.match(/^https?:\/\//i)) {
                    url = 'https://' + url;
                }
                return url;
            }
        },

        vcard: {
            name: 'Contact',
            icon: 'person',
            description: 'Contact card (vCard)',
            fields: [
                { name: 'firstName', label: 'First Name', type: 'text', placeholder: 'John', required: true },
                { name: 'lastName', label: 'Last Name', type: 'text', placeholder: 'Doe', required: false },
                { name: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555 123 4567', required: false },
                { name: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com', required: false },
                { name: 'company', label: 'Company', type: 'text', placeholder: 'Acme Inc.', required: false },
                { name: 'title', label: 'Job Title', type: 'text', placeholder: 'Software Engineer', required: false },
                { name: 'website', label: 'Website', type: 'url', placeholder: 'https://example.com', required: false },
                { name: 'address', label: 'Address', type: 'text', placeholder: '123 Main St, City, State', required: false }
            ],
            format: (data) => {
                const lines = ['BEGIN:VCARD', 'VERSION:3.0'];

                // Name
                const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
                if (fullName) {
                    lines.push(`FN:${fullName}`);
                    lines.push(`N:${data.lastName || ''};${data.firstName || ''};;;`);
                }

                // Organization
                if (data.company) {
                    lines.push(`ORG:${data.company}`);
                }
                if (data.title) {
                    lines.push(`TITLE:${data.title}`);
                }

                // Contact
                if (data.phone) {
                    lines.push(`TEL:${data.phone}`);
                }
                if (data.email) {
                    lines.push(`EMAIL:${data.email}`);
                }
                if (data.website) {
                    lines.push(`URL:${data.website}`);
                }
                if (data.address) {
                    lines.push(`ADR:;;${data.address};;;;`);
                }

                lines.push('END:VCARD');
                return lines.join('\n');
            }
        },

        phone: {
            name: 'Phone',
            icon: 'phone',
            description: 'Phone number to dial',
            fields: [
                { name: 'phone', label: 'Phone Number', type: 'tel', placeholder: '+1 555 123 4567', required: true }
            ],
            format: (data) => {
                // Strip all non-numeric characters except + at the start
                let phone = data.phone.trim();
                const hasPlus = phone.startsWith('+');
                phone = phone.replace(/[^\d]/g, '');
                if (hasPlus) phone = '+' + phone;
                return `tel:${phone}`;
            }
        },

        sms: {
            name: 'SMS',
            icon: 'chat',
            description: 'Text message',
            fields: [
                { name: 'phone', label: 'Phone Number', type: 'tel', placeholder: '+1 555 123 4567', required: true },
                { name: 'message', label: 'Message (optional)', type: 'textarea', placeholder: 'Hello!', required: false }
            ],
            format: (data) => {
                let phone = data.phone.trim();
                const hasPlus = phone.startsWith('+');
                phone = phone.replace(/[^\d]/g, '');
                if (hasPlus) phone = '+' + phone;

                let sms = `sms:${phone}`;
                if (data.message && data.message.trim()) {
                    sms += `?body=${encodeURIComponent(data.message.trim())}`;
                }
                return sms;
            }
        },

        email: {
            name: 'Email',
            icon: 'email',
            description: 'Email with subject & body',
            fields: [
                { name: 'to', label: 'Email Address', type: 'email', placeholder: 'hello@example.com', required: true },
                { name: 'subject', label: 'Subject (optional)', type: 'text', placeholder: 'Hello!', required: false },
                { name: 'body', label: 'Message (optional)', type: 'textarea', placeholder: 'Message content...', required: false }
            ],
            format: (data) => {
                let mailto = `mailto:${data.to.trim()}`;
                const params = [];

                if (data.subject && data.subject.trim()) {
                    params.push(`subject=${encodeURIComponent(data.subject.trim())}`);
                }
                if (data.body && data.body.trim()) {
                    params.push(`body=${encodeURIComponent(data.body.trim())}`);
                }

                if (params.length > 0) {
                    mailto += '?' + params.join('&');
                }
                return mailto;
            }
        },

        wifi: {
            name: 'WiFi',
            icon: 'wifi',
            description: 'WiFi network credentials',
            fields: [
                { name: 'ssid', label: 'Network Name (SSID)', type: 'text', placeholder: 'MyWiFiNetwork', required: true },
                { name: 'password', label: 'Password', type: 'text', placeholder: 'secretpassword', required: false },
                { name: 'encryption', label: 'Security', type: 'select', options: [
                    { value: 'WPA', label: 'WPA/WPA2/WPA3' },
                    { value: 'WEP', label: 'WEP' },
                    { value: 'nopass', label: 'None (Open)' }
                ], required: true },
                { name: 'hidden', label: 'Hidden Network', type: 'checkbox', required: false }
            ],
            format: (data) => {
                // Escape special characters in SSID and password
                const escape = (str) => {
                    if (!str) return '';
                    return str.replace(/([\\;,:"])/g, '\\$1');
                };

                let wifi = `WIFI:T:${data.encryption};S:${escape(data.ssid)}`;

                if (data.encryption !== 'nopass' && data.password) {
                    wifi += `;P:${escape(data.password)}`;
                }

                if (data.hidden) {
                    wifi += ';H:true';
                }

                wifi += ';;';
                return wifi;
            }
        },

        event: {
            name: 'Event',
            icon: 'calendar',
            description: 'Calendar event',
            fields: [
                { name: 'title', label: 'Event Title', type: 'text', placeholder: 'Team Meeting', required: true },
                { name: 'startDate', label: 'Start Date', type: 'date', required: true },
                { name: 'startTime', label: 'Start Time', type: 'time', required: false },
                { name: 'endDate', label: 'End Date', type: 'date', required: false },
                { name: 'endTime', label: 'End Time', type: 'time', required: false },
                { name: 'location', label: 'Location', type: 'text', placeholder: 'Conference Room A', required: false },
                { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Event details...', required: false }
            ],
            format: (data) => {
                const formatDateTime = (date, time) => {
                    if (!date) return null;
                    // Format: YYYYMMDD or YYYYMMDDTHHMMSS
                    const d = date.replace(/-/g, '');
                    if (time) {
                        const t = time.replace(/:/g, '') + '00';
                        return `${d}T${t}`;
                    }
                    return d;
                };

                const lines = ['BEGIN:VEVENT'];

                // Generate a unique ID
                lines.push(`UID:${Date.now()}@qrcode`);

                // Title
                lines.push(`SUMMARY:${data.title}`);

                // Start date/time
                const start = formatDateTime(data.startDate, data.startTime);
                if (start) {
                    lines.push(`DTSTART:${start}`);
                }

                // End date/time (default to start if not specified)
                const endDate = data.endDate || data.startDate;
                const end = formatDateTime(endDate, data.endTime);
                if (end) {
                    lines.push(`DTEND:${end}`);
                }

                // Location
                if (data.location) {
                    lines.push(`LOCATION:${data.location}`);
                }

                // Description
                if (data.description) {
                    lines.push(`DESCRIPTION:${data.description.replace(/\n/g, '\\n')}`);
                }

                lines.push('END:VEVENT');
                return `BEGIN:VCALENDAR\nVERSION:2.0\n${lines.join('\n')}\nEND:VCALENDAR`;
            }
        },

        geo: {
            name: 'Location',
            icon: 'location',
            description: 'Geographic coordinates',
            fields: [
                { name: 'latitude', label: 'Latitude', type: 'number', placeholder: '40.7128', required: true, step: 'any' },
                { name: 'longitude', label: 'Longitude', type: 'number', placeholder: '-74.0060', required: true, step: 'any' },
                { name: 'label', label: 'Label (optional)', type: 'text', placeholder: 'New York City', required: false }
            ],
            format: (data) => {
                let geo = `geo:${data.latitude},${data.longitude}`;
                if (data.label && data.label.trim()) {
                    geo += `?q=${encodeURIComponent(data.label.trim())}`;
                }
                return geo;
            }
        }
    },

    // Get list of all type keys
    getTypeList() {
        return Object.keys(this.types);
    },

    // Get type configuration
    getType(typeKey) {
        return this.types[typeKey];
    },

    // Format data for a given type
    format(typeKey, data) {
        const type = this.types[typeKey];
        if (!type) {
            throw new Error(`Unknown QR type: ${typeKey}`);
        }
        return type.format(data);
    },

    // Validate data for a given type
    validate(typeKey, data) {
        const type = this.types[typeKey];
        if (!type) return { valid: false, errors: ['Unknown type'] };

        const errors = [];
        for (const field of type.fields) {
            if (field.required) {
                const value = data[field.name];
                if (!value || (typeof value === 'string' && !value.trim())) {
                    errors.push(`${field.label} is required`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
};
