/*************************************************************************
 *
 * Copyright (C) 2018-2020 Ruilin Peng (Nick) <pymumu@gmail.com>.
 *
 * smartdns is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * smartdns is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


'use strict';
'require fs';
'require uci';
'require form';
'require view';
'require poll';
'require rpc';
'require ui';

var conf = 'smartdns';
var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});
var pollAdded = false;

function getServiceStatus() {
	return L.resolveDefault(callServiceList(conf), {})
		.then(function (res) {
			var isrunning = false;
			try {
				isrunning = res[conf]['instances']['smartdns']['running'];
			} catch (e) { }
			return isrunning;
		});
}

function smartdnsServiceStatus() {
	return Promise.all([
		getServiceStatus()
	]);
}

function smartdnsRenderStatus(res) {
	var renderHTML = "";
	var isRunning = res[0];

	var autoSetDnsmasq = uci.get_first('smartdns', 'smartdns', 'auto_set_dnsmasq');
	var smartdnsPort = uci.get_first('smartdns', 'smartdns', 'port');
	var dnsmasqServer = uci.get_first('dhcp', 'dnsmasq', 'server');

	if (isRunning) {
		renderHTML += "<span style=\"color:green;font-weight:bold\">SmartDNS - " + _("RUNNING") + "</span>";
	} else {
		renderHTML += "<span style=\"color:red;font-weight:bold\">SmartDNS - " + _("NOT RUNNING") + "</span>";
		return renderHTML;
	}

	if (autoSetDnsmasq === '1' && smartdnsPort != '53') {
		var matchLine = "127.0.0.1#" + smartdnsPort;

		uci.unload('dhcp');
		uci.load('dhcp');
		if (dnsmasqServer == undefined || dnsmasqServer.indexOf(matchLine) < 0) {
			renderHTML += "<br /><span style=\"color:red;font-weight:bold\">" + _("Dnsmasq Forwared To Smartdns Failure") + "</span>";
		}
	}

	return renderHTML;
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('dhcp'),
			uci.load('smartdns'),
		]);
	},
	render: function (stats) {
		var m, s, o;
		var ss, so;
		var servers, downlfiles;

		m = new form.Map('smartdns', _('SmartDNS'));
		m.title = _("SmartDNS Server");
		m.description = _("SmartDNS is a local high-performance DNS server, supports finding fastest IP, "
			+ "supports ad filtering, and supports avoiding DNS poisoning.");

		s = m.section(form.NamedSection, '_status');
		s.anonymous = true;
		s.render = function (section_id) {
			var renderStatus = function () {
				return L.resolveDefault(smartdnsServiceStatus()).then(function (res) {
					var view = document.getElementById("service_status");
					if (view == null) {
						return;
					}

					view.innerHTML = smartdnsRenderStatus(res);
				});
			}

			if (pollAdded == false) {
				poll.add(renderStatus, 1);
				pollAdded = true;
			}

			return E('div', { class: 'cbi-section' }, [
				E('div', { id: 'service_status' },
					_('Collecting data ...'))
			]);
		}

		////////////////
		// Basic;
		////////////////
		s = m.section(form.TypedSection, "smartdns", _("Settings"), _("General Settings"));
		s.anonymous = true;

		s.tab("settings", _("General Settings"));
		s.tab("advanced", _('Advanced Settings'));
		s.tab("seconddns", _("Second Server Settings"));
		s.tab("files", _("Download Files Setting"), _("Download domain list files for domain-rule and include config files, please refresh the page after download to take effect."));
		s.tab("custom", _("Custom Settings"));

		///////////////////////////////////////
		// Basic Settings
		///////////////////////////////////////
		o = s.taboption("settings", form.Flag, "enabled", _("Enable"), _("Enable or disable smartdns server"));
		o.rmempty = false;
		o.default = o.disabled;

		// server name;
		o = s.taboption("settings", form.Value, "server_name", _("Server Name"), _("Smartdns server name"));
		o.default = "smartdns";
		o.datatype = "hostname";
		o.rempty = false;

		// Port;
		o = s.taboption("settings", form.Value, "port", _("Local Port"),
			_("Smartdns local server port, smartdns will be automatically set as main dns when the port is 53."));
		o.placeholder = 53;
		o.default = 53;
		o.datatype = "port";
		o.rempty = false;

		// Enable TCP server;
		o = s.taboption("settings", form.Flag, "tcp_server", _("TCP Server"), _("Enable TCP DNS Server"));
		o.rmempty = false;
		o.default = o.enabled;

		// Support IPV6;
		o = s.taboption("settings", form.Flag, "ipv6_server", _("IPV6 Server"), _("Enable IPV6 DNS Server"));
		o.rmempty = false;
		o.default = o.enabled;

		///////////////////////////////////////
		// advanced settings;
		///////////////////////////////////////
		// Support DualStack ip selection;
		o = s.taboption("advanced", form.Flag, "dualstack_ip_selection", _("Dual-stack IP Selection"),
			_("Enable IP selection between IPV4 and IPV6"));
		o.rmempty = false;
		o.default = o.enabled;

		// Domain prefetch load ;
		o = s.taboption("advanced", form.Flag, "prefetch_domain", _("Domain prefetch"),
			_("Enable domain prefetch, accelerate domain response speed."));
		o.rmempty = false;
		o.default = o.disabled;

		// Domain Serve expired
		o = s.taboption("advanced", form.Flag, "serve_expired", _("Serve expired"),
			_("Attempts to serve old responses from cache with a TTL of 0 in the response without waiting for the actual resolution to finish."));
		o.rmempty = false;
		o.default = o.enabled;

		// cache-size;
		o = s.taboption("advanced", form.Value, "cache_size", _("Cache Size"), _("DNS domain result cache size"));
		o.rempty = true;

		// cache-size;
		o = s.taboption("advanced", form.Flag, "resolve_local_hostnames", _("Resolve Local Hostnames"), _("Resolve local hostnames by reading Dnsmasq lease file."));
		o.rmempty = false;
		o.default = o.enabled;

		// auto-conf-dnsmasq;
		o = s.taboption("advanced", form.Flag, "auto_set_dnsmasq", _("Automatically Set Dnsmasq"), _("Automatically set as upstream of dnsmasq when port changes."));
		o.rmempty = false;
		o.default = o.enabled;

		// Force AAAA SOA
		o = s.taboption("advanced", form.Flag, "force_aaaa_soa", _("Force AAAA SOA"), _("Force AAAA SOA."));
		o.rmempty = false;
		o.default = o.disabled;

		// Force HTTPS SOA
		o = s.taboption("advanced", form.Flag, "force_https_soa", _("Force HTTPS SOA"), _("Force HTTPS SOA."));
		o.rmempty = false;
		o.default = o.enabled;

		// rr-ttl;
		o = s.taboption("advanced", form.Value, "rr_ttl", _("Domain TTL"), _("TTL for all domain result."));
		o.rempty = true;

		// rr-ttl-min;
		o = s.taboption("advanced", form.Value, "rr_ttl_min", _("Domain TTL Min"),
			_("Minimum TTL for all domain result."));
		o.rempty = true;
		o.placeholder = "600";
		o.default = 600;
		o.optional = true;

		// rr-ttl-max;
		o = s.taboption("advanced", form.Value, "rr_ttl_max", _("Domain TTL Max"),
			_("Maximum TTL for all domain result."));
		o.rempty = true;

		// rr-ttl-reply-max;
		o = s.taboption("advanced", form.Value, "rr_ttl_reply_max", _("Reply Domain TTL Max"),
			_("Reply maximum TTL for all domain result."));
		o.rempty = true;

		// include config
		downlfiles = uci.sections('smartdns', 'download-file');
		o = s.taboption("advanced", form.DynamicList, "conf_files", _("Include Config Files<br>/etc/smartdns/conf.d"),
			_("Include other config files from /etc/smartdns/conf.d or custom path, can be downloaded from the download page."));
		for (var i = 0; i < downlfiles.length; i++) {
			if (downlfiles[i].type == undefined) {
				continue;
			}

			if (downlfiles[i].type != 'config') {
				continue
			}

			o.value(downlfiles[i].name);
		}

		///////////////////////////////////////
		// second dns server;
		///////////////////////////////////////
		// Eanble;
		o = s.taboption("seconddns", form.Flag, "seconddns_enabled", _("Enable"),
			_("Enable or disable second DNS server."));
		o.default = o.disabled;
		o.rempty = false;

		// Port;
		o = s.taboption("seconddns", form.Value, "seconddns_port", _("Local Port"), _("Smartdns local server port"));
		o.placeholder = 6553;
		o.default = 6553;
		o.datatype = "port";
		o.rempty = false;

		// Enable TCP server;
		o = s.taboption("seconddns", form.Flag, "seconddns_tcp_server", _("TCP Server"), _("Enable TCP DNS Server"));
		o.rmempty = false;
		o.default = o.enabled;

		// dns server group;
		o = s.taboption("seconddns", form.Value, "seconddns_server_group", _("Server Group"),
			_("Query DNS through specific dns server group, such as office, home."));
		o.rmempty = true;
		o.placeholder = "default";
		o.datatype = "hostname";
		o.rempty = true;

		o = s.taboption("seconddns", form.Flag, "seconddns_no_speed_check", _("Skip Speed Check"),
			_("Do not check speed."));
		o.rmempty = false;
		o.default = o.disabled;

		// skip address rules;
		o = s.taboption("seconddns", form.Flag, "seconddns_no_rule_addr", _("Skip Address Rules"),
			_("Skip address rules."));
		o.rmempty = false;
		o.default = o.disabled;

		// skip name server rules;
		o = s.taboption("seconddns", form.Flag, "seconddns_no_rule_nameserver", _("Skip Nameserver Rule"),
			_("Skip nameserver rules."));
		o.rmempty = false;
		o.default = o.disabled;

		// skip ipset rules;
		o = s.taboption("seconddns", form.Flag, "seconddns_no_rule_ipset", _("Skip Ipset Rule"),
			_("Skip ipset rules."));
		o.rmempty = false;
		o.default = o.disabled;

		// skip soa address rule;
		o = s.taboption("seconddns", form.Flag, "seconddns_no_rule_soa", _("Skip SOA Address Rule"),
			_("Skip SOA address rules."));
		o.rmempty = false;
		o.default = o.disabled;

		o = s.taboption("seconddns", form.Flag, "seconddns_no_dualstack_selection", _("Skip Dualstack Selection"),
			_("Skip Dualstack Selection."));
		o.rmempty = false;
		o.default = o.disabled;

		// skip cache;
		o = s.taboption("seconddns", form.Flag, "seconddns_no_cache", _("Skip Cache"), _("Skip Cache."));
		o.rmempty = false;
		o.default = o.disabled;

		// Force AAAA SOA
		o = s.taboption("seconddns", form.Flag, "seconddns_force_aaaa_soa", _("Force AAAA SOA"), _("Force AAAA SOA."));
		o.rmempty = false;
		o.default = o.disabled;

		///////////////////////////////////////
		// download Files Settings
		///////////////////////////////////////
		o = s.taboption("files", form.Flag, "enable_auto_update", _("Enable Auto Update"), _("Enable daily auto update."));
		o.rmempty = false;
		o.default = o.disabled;
		o.rempty = true;

		o = s.taboption("files", form.FileUpload, "upload_conf_file", _("Upload Config File"),
			_("Upload smartdns config file to /etc/smartdns/conf.d"));
		o.rmempty = true
		o.datatype = "file"
		o.rempty = true
		o.editable = true
		o.root_directory = "/etc/smartdns/conf.d"

		o = s.taboption("files", form.FileUpload, "upload_list_file", _("Upload Domain List File"),
			_("Upload domain list file to /etc/smartdns/domain-set"));
		o.rmempty = true
		o.datatype = "file"
		o.rempty = true
		o.editable = true
		o.root_directory = "/etc/smartdns/domain-set"

		o = s.taboption('files', form.DummyValue, "_update", _("Update Files"));
		o.renderWidget = function () {
			return E('button', {
				'class': 'btn cbi-button cbi-button-apply',
				'id': 'btn_update',
				'click': ui.createHandlerFn(this, function () {
					return fs.exec('/etc/init.d/smartdns', ['updatefiles'])
						.catch(function (e) { ui.addNotification(null, E('p', e.message), 'error') });
				})
			}, [_("Update")]);
		}

		o = s.taboption('files', form.SectionValue, '__files__', form.GridSection, 'download-file', _('Download Files'),
			_('List of files to download.'));

		ss = o.subsection;

		ss.addremove = true;
		ss.anonymous = true;
		ss.sortable = true;

		so = ss.option(form.Value, 'name', _('File Name'), _('File Name'));
		so.rmempty = false;
		so.datatype = 'file';

		so = ss.option(form.Value, 'url', _('URL'), _('URL'));
		so.rmempty = false;
		so.datatype = 'string';
		so.validate = function (section_id, value) {
			if (value == "") {
				return true;
			}

			if (!value.match(/^(http|https|ftp|sftp):\/\//)) {
				return _("URL format error, format: http:// or https://");
			}

			return true;
		}

		so = ss.option(form.ListValue, "type", _("type"), _("File Type"));
		so.value("list", _("domain list (/etc/smartdns/domain-set)"));
		so.value("config", _("smartdns config (/etc/smartdns/conf.d)"));
		so.default = "list";
		so.rempty = false;

		so = ss.option(form.Value, 'desc', _('Description'), _('Description'));
		so.rmempty = true;
		so.datatype = 'string';

		///////////////////////////////////////
		// custom settings;
		///////////////////////////////////////
		o = s.taboption("custom", form.TextValue, "custom_conf",
			"", _("smartdns custom settings"));
		o.rows = 20;
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/etc/smartdns/custom.conf');
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/etc/smartdns/custom.conf', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};

		o = s.taboption("custom", form.Flag, "coredump", _("Generate Coredump"),
			_("Generate Coredump file when smartdns crash, coredump file is located at /tmp/smartdns.xxx.core."));
		o.rmempty = false;
		o.default = o.disabled;

		////////////////
		// Upstream servers;
		////////////////
		s = m.section(form.GridSection, "server", _("Upstream Servers"),
			_("Upstream Servers, support UDP, TCP protocol. Please configure multiple DNS servers, "
				+ "including multiple foreign DNS servers."));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;

		s.tab('general', _('General Settings'));
		s.tab('advanced', _('Advanced Settings'));

		// enable flag;
		o = s.taboption("general", form.Flag, "enabled", _("Enable"), _("Enable"));
		o.rmempty = false;
		o.default = o.enabled;
		o.editable = true;

		// name;
		o = s.taboption("general", form.Value, "name", _("DNS Server Name"), _("DNS Server Name"));

		// IP address;
		o = s.taboption("general", form.Value, "ip", _("ip"), _("DNS Server ip"));
		o.datatype = "or(ipaddr, string)";
		o.rmempty = false;

		// port;
		o = s.taboption("general", form.Value, "port", _("port"), _("DNS Server port"));
		o.placeholder = "default";
		o.datatype = "port";
		o.rempty = true;
		o.depends("type", "udp");
		o.depends("type", "tcp");
		o.depends("type", "tls");

		// type;
		o = s.taboption("general", form.ListValue, "type", _("type"), _("DNS Server type"));
		o.placeholder = "udp";
		o.value("udp", _("udp"));
		o.value("tcp", _("tcp"));
		o.value("tls", _("tls"));
		o.value("https", _("https"));
		o.default = "udp";
		o.rempty = false;

		// server group
		o = s.taboption("general", form.Value, "server_group", _("Server Group"), _("DNS Server group"))
		o.rmempty = true;
		o.placeholder = "default";
		o.datatype = "hostname";
		o.rempty = true;
		servers = uci.sections('smartdns', 'server');
		var groupnames = new Set();
		for (var i = 0; i < servers.length; i++) {
			if (servers[i].server_group == undefined) {
				continue;
			}
			groupnames.add(servers[i].server_group);
		}

		for (const groupname of groupnames) {
			o.value(groupname);
		}

		// Advanced Options
		o = s.taboption("advanced", form.Flag, "exclude_default_group", _("Exclude Default Group"), _("Exclude DNS Server from default group."))
		o.rmempty = false;
		o.default = o.disabled;
		o.editable = true;
		o.modalonly = true;

		// blacklist_ip
		o = s.taboption("advanced", form.Flag, "blacklist_ip", _("IP Blacklist Filtering"),
			_("Filtering IP with blacklist"))
		o.rmempty = false
		o.default = o.disabled
		o.modalonly = true;

		// TLS host verify
		o = s.taboption("advanced", form.Value, "tls_host_verify", _("TLS Hostname Verify"),
			_("Set TLS hostname to verify."))
		o.default = ""
		o.datatype = "string"
		o.rempty = true
		o.modalonly = true;
		o.depends("type", "tls")
		o.depends("type", "https")

		// certificate verify
		o = s.taboption("advanced", form.Flag, "no_check_certificate", _("No check certificate"),
			_("Do not check certificate."))
		o.rmempty = false
		o.default = o.disabled
		o.modalonly = true;
		o.depends("type", "tls")
		o.depends("type", "https")

		// SNI host name
		o = s.taboption("advanced", form.Value, "host_name", _("TLS SNI name"),
			_("Sets the server name indication for query. '-' for disable SNI name."))
		o.default = ""
		o.datatype = "hostname"
		o.rempty = true
		o.modalonly = true;
		o.depends("type", "tls")
		o.depends("type", "https")

		// http host
		o = s.taboption("advanced", form.Value, "http_host", _("HTTP Host"),
			_("Set the HTTP host used for the query. Use this parameter when the host of the URL address is an IP address."))
		o.default = ""
		o.datatype = "hostname"
		o.rempty = true
		o.modalonly = true;
		o.depends("type", "https")

		// SPKI pin
		o = s.taboption("advanced", form.Value, "spki_pin", _("TLS SPKI Pinning"),
			_("Used to verify the validity of the TLS server, The value is Base64 encoded SPKI fingerprint, "
				+ "leaving blank to indicate that the validity of TLS is not verified."))
		o.default = ""
		o.datatype = "string"
		o.rempty = true
		o.modalonly = true;
		o.depends("type", "tls")
		o.depends("type", "https")

		// other args
		o = s.taboption("advanced", form.Value, "addition_arg", _("Additional Server Args"),
			_("Additional Args for upstream dns servers"))
		o.default = ""
		o.rempty = true
		o.modalonly = true;

		////////////////
		// domain rules;
		////////////////
		s = m.section(form.TypedSection, "domain-rule", _("Domain Rules"), _("Domain Rules Settings"));
		s.anonymous = true;
		s.nodescriptions = true;

		s.tab("forwarding", _('DNS Forwarding Setting'));
		s.tab("block", _("DNS Block Setting"));
		s.tab("domain-address", _("Domain Address"), _("Set Specific domain ip address."));
		s.tab("blackip-list", _("IP Blacklist"), _("Set Specific ip blacklist."));

		///////////////////////////////////////
		// domain forwarding;
		///////////////////////////////////////
		o = s.taboption("forwarding", form.Value, "server_group", _("Server Group"), _("DNS Server group belongs to, such as office, home."))
		o.rmempty = true
		o.placeholder = "default"
		o.datatype = "hostname"
		o.rempty = true
		for (const groupname of groupnames) {
			o.value(groupname);
		}
		o.validate = function (section_id, value) {
			if (value == "") {
				return true;
			}

			var val = uci.sections('smartdns', 'server');
			for (var i = 0; i < val.length; i++) {
				if (value == val[i].server_group) {
					return true;
				}
			}

			return _('Server Group %s not exists').format(value);

		}

		o = s.taboption("forwarding", form.Flag, "no_speed_check", _("Skip Speed Check"),
			_("Do not check speed."));
		o.rmempty = false;
		o.default = o.disabled;

		o = s.taboption("forwarding", form.Flag, "force_aaaa_soa", _("Force AAAA SOA"), _("Force AAAA SOA."));
		o.rmempty = false;
		o.default = o.disabled;

		o = s.taboption("forwarding", form.Value, "ipset_name", _("IPset Name"), _("IPset name."));
		o.rmempty = true;
		o.datatype = "hostname";
		o.rempty = true;

		o = s.taboption("forwarding", form.Value, "nftset_name", _("NFTset Name"), _("NFTset name, format: [#[4|6]:[family#table#set]]"));
		o.rmempty = true;
		o.datatype = "string";
		o.rempty = true;
		o.validate = function (section_id, value) {
			if (value == "") {
				return true;
			}

			var nftset = value.split(",")
			for (var i = 0; i < nftset.length; i++) {
				if (!nftset[i].match(/#[4|6]:[a-zA-Z0-9\-_]+#[a-zA-Z0-9\-_]+#[a-zA-Z0-9\-_]+$/)) {
					return _("NFTset name format error, format: [#[4|6]:[family#table#set]]");
				}
			}

			return true;
		}

		o = s.taboption("forwarding", form.FileUpload, "forwarding_domain_set_file", _("Domain List File"),
			_("Upload domain list file, or configure auto download from Download File Setting page."));
		o.rmempty = true
		o.datatype = "file"
		o.rempty = true
		o.editable = true
		o.root_directory = "/etc/smartdns/domain-set"

		o = s.taboption("forwarding", form.TextValue, "domain_forwarding_list",
			_("Domain List"), _("Configure forwarding domain name list."));
		o.rows = 10;
		o.cols = 64;
		o.monospace = true;
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/etc/smartdns/domain-forwarding.list').catch(function (e) {
				return "";
			});
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/etc/smartdns/domain-forwarding.list', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};

		///////////////////////////////////////
		// domain block;
		///////////////////////////////////////
		o = s.taboption("block", form.FileUpload, "block_domain_set_file", _("Domain List File"), _("Upload domain list file."));
		o.rmempty = true
		o.datatype = "file"
		o.rempty = true
		o.editable = true
		o.root_directory = "/etc/smartdns/domain-set"

		o = s.taboption("block", form.TextValue, "domain_block_list",
			_("Domain List"), _("Configure block domain list."));
		o.rows = 10;
		o.cols = 64;
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/etc/smartdns/domain-block.list').catch(function (e) {
				return "";
			});
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/etc/smartdns/domain-block.list', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};

		///////////////////////////////////////
		// IP Blacklist;
		///////////////////////////////////////
		// blacklist;
		o = s.taboption("blackip-list", form.TextValue, "blackip_ip_conf",
			"", _("Configure IP blacklists that will be filtered from the results of specific DNS server."));
		o.rows = 20;
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/etc/smartdns/blacklist-ip.conf');
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/etc/smartdns/blacklist-ip.conf', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};

		///////////////////////////////////////
		// domain address
		///////////////////////////////////////
		o = s.taboption("domain-address", form.TextValue, "address_conf",
			"",
			_("Specify an IP address to return for any host in the given domains, Queries in the domains are never "
				+ "forwarded and always replied to with the specified IP address which may be IPv4 or IPv6."));
		o.rows = 20;
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/etc/smartdns/address.conf');
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/etc/smartdns/address.conf', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};

		////////////////
		// Support
		////////////////
		s = m.section(form.TypedSection, "smartdns", _("Technical Support"),
			_("If you like this software, please buy me a cup of coffee."));
		s.anonymous = true;

		o = s.option(form.Button, "web");
		o.title = _("SmartDNS official website");
		o.inputtitle = _("open website");
		o.inputstyle = "apply";
		o.onclick = function () {
			window.open("https://pymumu.github.io/smartdns", '_blank');
		};

		o = s.option(form.Button, "Donate");
		o.title = _("Donate to smartdns");
		o.inputtitle = _("Donate");
		o.inputstyle = "apply";
		o.onclick = function () {
			window.open("https://pymumu.github.io/smartdns/#donate", '_blank');
		};

		o = s.option(form.DummyValue, "_restart", _("Restart Service"));
		o.renderWidget = function () {
			return E('button', {
				'class': 'btn cbi-button cbi-button-apply',
				'id': 'btn_restart',
				'click': ui.createHandlerFn(this, function () {
					return fs.exec('/etc/init.d/smartdns', ['restart'])
						.catch(function (e) { ui.addNotification(null, E('p', e.message), 'error') });
				})
			}, [_("Restart")]);
		}
		return m.render();
	}
});
