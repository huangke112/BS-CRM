// 配置
const CONFIG = {
  APP_TOKEN: 'YBEAbCCQgaRn5CsET5ic4KLFn5x',
  CUSTOMER_TABLE_ID: 'tblBabNIast3kEyM',
  FOLLOWUP_TABLE_ID: 'tbluUII2HFh7E2HJ',
  FEISHU_APP_ID: 'cli_a93526e42bb89cb1', // 需要替换为实际值
  FEISHU_APP_SECRET: 'X2W955O2C4kQGD0EkXxomg1AQkW7cpIi' // 需要替换为实际值
};

// 选项数据
const OPTIONS = {
  progress: ['未建联', '已建联', '已拜访', '已绑店', '已放款', '已结清', '暂停合作'],
  layer: ['战略客户', 'P0', 'P1', 'P2'],
  mode: ['品牌', '精铺', '铺货', '工贸一体', '品牌代理'],
  source: ['市场', '渠道', '自拓', '公司资源'],
  followupType: ['电话', '微信', '上门拜访', '线下活动'],
  areas: ['深圳市', '上海市', '杭州市', '厦门市', '广州市', '珠海市', '佛山市', '东莞市', '惠州市', '北京市', '浙江省', '江苏省', '其他']
};

const { createApp } = Vue;

createApp({
  data() {
    return {
      isLoggedIn: false,
      currentUser: null,
      currentPage: 'home',
      customers: [],
      followups: [],
      currentCustomer: null,
      searchQuery: '',
      filters: { progress: '', layer: '' },
      isMyCustomers: false,
      warningCustomers: [],
      showWarningDetail: false,
      
      // 选择器
      showProgressPicker: false,
      showLayerPicker: false,
      showModePicker: false,
      showSourcePicker: false,
      showAreaPicker: false,
      showFollowupTypePicker: false,
      
      // 选项
      progressOptions: OPTIONS.progress,
      layerOptions: OPTIONS.layer,
      modeOptions: OPTIONS.mode,
      sourceOptions: OPTIONS.source,
      areaOptions: OPTIONS.areas,
      followupTypeOptions: OPTIONS.followupType,
      
      // 新增客户
      newCustomer: {
        公司名称: '', KP: '', 客户 MID: '', GMV: '', TPV: '', 贷款余额: '',
        客户进展: '未建联', 客户分层: '', 运营模式: '', 客户来源: '', 地区归属: '', 销售: ''
      },
      
      // 新增跟进
      newFollowup: {
        公司名字: '', 跟进方式: '', 参与人员: '', 跟进情况: '', 智能纪要: '', 跟进地点: null
      },
      
      // GPS
      location: null,
      locationStatus: '点击获取位置'
    };
  },
  
  computed: {
    filteredCustomers() {
      return this.customers.filter(c => {
        if (this.searchQuery) {
          const q = this.searchQuery.toLowerCase();
          if (!c.公司名称?.toLowerCase().includes(q) && !c.KP?.toLowerCase().includes(q)) return false;
        }
        if (this.filters.progress && c.客户进展 !== this.filters.progress) return false;
        if (this.filters.layer && c.客户分层 !== this.filters.layer) return false;
        if (this.isMyCustomers && c.销售 !== this.currentUser?.name) return false;
        return true;
      });
    }
  },
  
  async mounted() {
    // 检查登录状态
    const token = localStorage.getItem('feishu_token');
    const user = localStorage.getItem('feishu_user');
    if (token && user) {
      this.isLoggedIn = true;
      this.currentUser = JSON.parse(user);
      await this.loadCustomers();
      await this.checkWarning();
    }
  },
  
  methods: {
    // 飞书登录（简化版：模拟登录，实际需对接飞书 OAuth）
    async feishuLogin() {
      // TODO: 实际部署时需要对接飞书 OAuth
      // 这里先模拟登录
      this.currentUser = { name: '当前用户', id: 'user_001' };
      this.isLoggedIn = true;
      localStorage.setItem('feishu_token', 'mock_token');
      localStorage.setItem('feishu_user', JSON.stringify(this.currentUser));
      
      await this.loadCustomers();
      await this.checkWarning();
      
      this.$toast.success('登录成功');
    },
    
    // 加载客户列表
    async loadCustomers() {
      try {
        const res = await axios.get(
          `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.CUSTOMER_TABLE_ID}/records`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('feishu_token')}` } }
        );
        this.customers = res.data.data.items.map(item => item.fields);
      } catch (e) {
        console.error('加载客户失败', e);
        this.$toast.fail('加载客户失败，请检查网络');
      }
    },
    
    // 检查 P0 客户未跟进提醒
    async checkWarning() {
      try {
        // 获取所有跟进记录
        const res = await axios.get(
          `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.FOLLOWUP_TABLE_ID}/records`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('feishu_token')}` } }
        );
        const followups = res.data.data.items.map(item => item.fields);
        
        // 获取当前用户负责的 P0/战略客户
        const p0Customers = this.customers.filter(c => 
          (c.客户分层 === 'P0' || c.客户分层 === '战略客户') &&
          c.销售 === this.currentUser?.name
        );
        
        // 计算每个客户最后跟进日期
        const now = new Date();
        this.warningCustomers = p0Customers.filter(c => {
          const lastFollowup = followups
            .filter(f => f.公司名字?.some(name => name.includes(c.公司名称)))
            .map(f => new Date(f.跟进日期))
            .sort((a, b) => b - a)[0];
          
          if (!lastFollowup) return true; // 从未跟进
          const days = (now - lastFollowup) / (1000 * 60 * 60 * 24);
          return days > 7;
        }).map(c => ({
          name: c.公司名称,
          layer: c.客户分层,
          lastFollowup: followups
            .filter(f => f.公司名字?.some(name => name.includes(c.公司名称)))
            .map(f => f.跟进日期)
            .sort()[0] || '从未'
        }));
      } catch (e) {
        console.error('检查提醒失败', e);
      }
    },
    
    // 跳转详情
    goToDetail(customer) {
      this.currentCustomer = { ...customer };
      this.currentPage = 'detail';
      this.loadFollowups(customer.公司名称);
    },
    
    // 通过公司名跳转
    goToDetailByName(name) {
      const customer = this.customers.find(c => c.公司名称 === name);
      if (customer) this.goToDetail(customer);
    },
    
    // 加载跟进记录
    async loadFollowups(companyName) {
      try {
        const res = await axios.get(
          `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.FOLLOWUP_TABLE_ID}/records`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('feishu_token')}` } }
        );
        this.followups = res.data.data.items
          .filter(item => item.fields.公司名字?.some(name => name.includes(companyName)))
          .map(item => item.fields)
          .sort((a, b) => new Date(b.跟进日期) - new Date(a.跟进日期));
      } catch (e) {
        console.error('加载跟进记录失败', e);
      }
    },
    
    // 保存客户
    async saveCustomer() {
      if (!this.newCustomer.公司名称) {
        this.$toast.fail('公司名称必填');
        return;
      }
      
      try {
        await axios.post(
          `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.CUSTOMER_TABLE_ID}/records`,
          { fields: this.newCustomer },
          { headers: { Authorization: `Bearer ${localStorage.getItem('feishu_token')}` } }
        );
        this.$toast.success('保存成功');
        this.currentPage = 'home';
        this.newCustomer = { 公司名称: '', KP: '', 客户 MID: '', GMV: '', TPV: '', 贷款余额: '', 客户进展: '未建联', 客户分层: '', 运营模式: '', 客户来源: '', 地区归属: '', 销售: '' };
        await this.loadCustomers();
      } catch (e) {
        console.error('保存客户失败', e);
        this.$toast.fail('保存失败：' + (e.response?.data?.msg || '未知错误'));
      }
    },
    
    // 更新客户
    async updateCustomer() {
      try {
        // 需要先获取记录 ID
        const res = await axios.get(
          `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.CUSTOMER_TABLE_ID}/records`,
          { 
            params: { filter: `{"conjunction":"and","conditions":[{"field_name":"公司名称","operator":"contains","value":"${this.currentCustomer.公司名称}"}]}` },
            headers: { Authorization: `Bearer ${localStorage.getItem('feishu_token')}` }
          }
        );
        const recordId = res.data.data.items[0]?.id;
        
        if (recordId) {
          await axios.put(
            `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.CUSTOMER_TABLE_ID}/records/${recordId}`,
            { fields: this.currentCustomer },
            { headers: { Authorization: `Bearer ${localStorage.getItem('feishu_token')}` } }
          );
          this.$toast.success('更新成功');
          this.currentPage = 'detail';
          await this.loadCustomers();
        }
      } catch (e) {
        console.error('更新客户失败', e);
        this.$toast.fail('更新失败');
      }
    },
    
    // 保存跟进
    async saveFollowup() {
      if (!this.newFollowup.公司名字 || !this.newFollowup.跟进方式 || !this.newFollowup.跟进情况) {
        this.$toast.fail('请填写必填项');
        return;
      }
      
      try {
        await axios.post(
          `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.FOLLOWUP_TABLE_ID}/records`,
          { 
            fields: {
              ...this.newFollowup,
              跟进地点: this.location ? `${this.location.latitude},${this.location.longitude}` : null
            }
          },
          { headers: { Authorization: `Bearer ${localStorage.getItem('feishu_token')}` } }
        );
        this.$toast.success('保存成功');
        this.currentPage = 'detail';
        this.newFollowup = { 公司名字: '', 跟进方式: '', 参与人员: '', 跟进情况: '', 智能纪要: '', 跟进地点: null };
        this.location = null;
        this.locationStatus = '点击获取位置';
        await this.loadFollowups(this.currentCustomer.公司名称);
      } catch (e) {
        console.error('保存跟进失败', e);
        this.$toast.fail('保存失败');
      }
    },
    
    // 获取 GPS 位置
    getLocation() {
      if (!navigator.geolocation) {
        this.$toast.fail('浏览器不支持定位');
        return;
      }
      
      this.locationStatus = '获取中...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          this.locationStatus = '已获取位置 ✓';
          this.$toast.success('位置获取成功');
        },
        (err) => {
          console.error('获取位置失败', err);
          this.locationStatus = '获取失败，请允许定位权限';
          this.$toast.fail('获取位置失败');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    },
    
    // 选择器确认
    onProgressConfirm({ selectedOptions }) { this.newCustomer.客户进展 = selectedOptions[0].value; this.showProgressPicker = false; },
    onLayerConfirm({ selectedOptions }) { this.newCustomer.客户分层 = selectedOptions[0].value; this.showLayerPicker = false; },
    onModeConfirm({ selectedOptions }) { this.newCustomer.运营模式 = selectedOptions[0].value; this.showModePicker = false; },
    onSourceConfirm({ selectedOptions }) { this.newCustomer.客户来源 = selectedOptions[0].value; this.showSourcePicker = false; },
    onAreaConfirm({ selectedOptions }) { this.newCustomer.地区归属 = selectedOptions[0].value; this.showAreaPicker = false; },
    onFollowupTypeConfirm({ selectedOptions }) { this.newFollowup.跟进方式 = selectedOptions[0].value; this.showFollowupTypePicker = false; },
    
    // 选择客户用于跟进
    selectCustomerForFollowup() {
      this.$toast('请在客户列表中选择');
      // 简化：直接输入公司名
      const name = prompt('请输入公司名：');
      if (name) this.newFollowup.公司名字 = name;
    },
    
    // 格式化
    formatNumber(num) { return num ? (num > 10000 ? (num/10000).toFixed(1) + '万' : num) : '-'; },
    formatUser(user) { return user?.name || user || '-'; },
    formatUsers(users) { return Array.isArray(users) ? users.map(u => u.name).join(', ') : (users || '-'); },
    formatLocation(loc) { return loc || '-'; },
    getLayerClass(layer) { 
      const map = { '战略客户': 'tag-strategy', 'P0': 'tag-p0', 'P1': 'tag-p1', 'P2': 'tag-p2' };
      return map[layer] || 'tag-p1';
    },
    handleSearch() { /* 搜索逻辑已在 computed 中 */ }
  }
}).use(vant).mount('#app');