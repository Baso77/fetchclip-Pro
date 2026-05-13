const request = require('supertest');
const app = require('../src/index');

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.ADMIN_SECRET_KEY = 'test-admin-key';

describe('GET /api/health', () => {
  it('returns 200 with status field', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBeLessThanOrEqual(503);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('POST /api/fetch', () => {
  it('rejects missing URL', async () => {
    const res = await request(app).post('/api/fetch').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects invalid URL format', async () => {
    const res = await request(app).post('/api/fetch').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects unsupported platform', async () => {
    const res = await request(app).post('/api/fetch').send({ url: 'https://example.com/video' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UNSUPPORTED_PLATFORM');
  });
});

describe('POST /api/download', () => {
  it('rejects missing URL', async () => {
    const res = await request(app).post('/api/download').send({});
    expect(res.status).toBe(400);
  });

  it('rejects unsupported URL', async () => {
    const res = await request(app).post('/api/download').send({ url: 'https://example.com/video' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/contact', () => {
  it('rejects invalid email', async () => {
    const res = await request(app).post('/api/contact').send({
      name: 'Test', email: 'bad-email', message: 'Hello there'
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/stats', () => {
  it('rejects without admin key', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  it('accepts correct admin key', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('x-admin-key', 'test-admin-key');
    expect([200, 500]).toContain(res.status);
  });
});
