import api from './api';

export const teamService = {
  async list() {
    const { data } = await api.get('/teams');
    return data;
  },
  async current() {
    const { data } = await api.get('/teams/current');
    return data;
  },
  async create(name) {
    const { data } = await api.post('/teams', { name });
    return data;
  },
  async join(inviteCode) {
    const { data } = await api.post('/teams/join', { inviteCode });
    return data;
  },
  async updateMemberRole(userId, role) {
    const { data } = await api.patch(`/teams/current/members/${userId}`, { role });
    return data;
  },
  async removeMember(userId) {
    const { data } = await api.delete(`/teams/current/members/${userId}`);
    return data;
  },
  async regenerateInviteCode() {
    const { data } = await api.post('/teams/current/invite-code');
    return data;
  },
};
