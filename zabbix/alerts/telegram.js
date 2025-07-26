var Telegram = {
  token: null,
  to: null,
  message: null,
  proxy: null,
  parse_mode: null,
  escapeMarkup: function (str, mode) {
      switch (mode) {
          case 'markdown':
              return str.replace(/([_*\[`])/g, '\\$&');
          case 'markdownv2':
              return str.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$&');
          case 'html':
              return str.replace(/<(\s|[^a-z\/])/g, '&lt;$1');
          default:
              return str;
      }
  },
  sendMessage: function () {
      var params = {
          chat_id: Telegram.to,
          text: Telegram.message,
          disable_web_page_preview: true,
          disable_notification: false
      },
      data,
      response,
      request = new HttpRequest(),
      url = 'https://api.telegram.org/bot' + Telegram.token + '/sendMessage';
      if (Telegram.parse_mode !== null) {
          params['parse_mode'] = Telegram.parse_mode;
      }
      if (Telegram.proxy) {
          request.setProxy(Telegram.proxy);
      }
      request.addHeader('Content-Type: application/json');
      data = JSON.stringify(params);
      // Remove replace() function if you want to see the exposed token in the log file.
      Zabbix.log(4, '[Telegram Webhook] URL: ' + url.replace(Telegram.token, '<TOKEN>'));
      Zabbix.log(4, '[Telegram Webhook] params: ' + data);
      response = request.post(url, data);
      Zabbix.log(4, '[Telegram Webhook] HTTP code: ' + request.getStatus());
      try {
          response = JSON.parse(response);
      }
      catch (error) {
          response = null;
      }
      if (request.getStatus() !== 200 || typeof response.ok !== 'boolean' || response.ok !== true) {
          if (typeof response.description === 'string') {
              throw response.description;
          }
          else {
              throw 'Unknown error. Check debug log for more information.';
          }
      }
  }
};

function formatIndonesianDate(dateStr) {
  try {
    var date = new Date(dateStr);
    
    if (isNaN(date.getTime())) {
      var matches = dateStr.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/);
      if (matches) {
        var year = parseInt(matches[1]);
        var month = parseInt(matches[2]) - 1;
        var day = parseInt(matches[3]);
        var hour = parseInt(matches[4]);
        var minute = parseInt(matches[5]);
        var second = parseInt(matches[6]);
        
        date = new Date(year, month, day, hour, minute, second);
      } else {
        date = new Date();
      }
    }
    
    var months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    
    var day = date.getDate();
    var month = months[date.getMonth()];
    var year = date.getFullYear();
    var hour = (date.getHours() < 10 ? "0" : "") + date.getHours();
    var minute = (date.getMinutes() < 10 ? "0" : "") + date.getMinutes();
    
    return day + " " + month + " " + year + ", " + hour + ":" + minute;
  } catch (e) {
    Zabbix.log(3, '[Telegram Webhook] Error formatting date: ' + e);
    return "Tanggal tidak valid";
  }
}

function formatTelegramMessage(csvData) {
  try {
      var values = csvData.split(';');
      var message = "";
      
      var timestamp = new Date();
      var formattedDate = formatIndonesianDate(new Date(timestamp.getTime() + (7 * 60 * 60 * 1000)));
      message += formattedDate + "\n\n";
      
      message += "Penggunaan CPU: " + values[1] + "%\n";
      message += "Penggunaan Memory: " + values[12] + "%\n\n";
      
      message += "Penggunaan Proses Tertinggi pada CPU:\n";
      for (var i = 1; i <= 5; i++) {
          var procNameIndex = 2 + (i-1)*2;
          var procUsageIndex = 3 + (i-1)*2;
          if (procNameIndex < values.length && procUsageIndex < values.length) {
              message += i + ". " + values[procNameIndex] + " = " + values[procUsageIndex] + "%\n";
          }
      }
      
      message += "\n";
      
      message += "Penggunaan Proses Tertinggi pada Memory:\n";
      var hasMemProcesses = false;
      for (var i = 1; i <= 5; i++) {
          var procNameIndex = 13 + (i-1)*2;
          var procUsageIndex = 14 + (i-1)*2;
          if (procNameIndex < values.length && procUsageIndex < values.length && 
              values[procNameIndex] && values[procUsageIndex]) {
              message += i + ". " + values[procNameIndex] + " = " + values[procUsageIndex] + "%\n";
              hasMemProcesses = true;
          }
      }
      
      if (!hasMemProcesses) {
          message += "Tidak ada data proses Memory\n";
      }
      
      message += "\n";
      
      var nginxConnections = values[23] || "0";
      var nginxRps = values[24] || "0";
      message += "Jumlah koneksi aktif pada webserver: " + nginxConnections + "\n";
      message += "Jumlah permintaan per detik di webserver: " + nginxRps;
      
      return message;
  } catch (error) {
      Zabbix.log(3, '[Telegram Webhook] Error formatting message: ' + error);
      return "Error formatting message. Check Zabbix logs for details.";
  }
}

try {
  var params = JSON.parse(value);
  if (typeof params.Token === 'undefined') {
      throw 'Incorrect value is given for parameter "Token": parameter is missing';
  }
  Telegram.token = params.Token;
  if (params.HTTPProxy) {
      Telegram.proxy = params.HTTPProxy;
  } 
  
  if (typeof params.ParseMode !== 'undefined') {
      params.ParseMode = params.ParseMode.toLowerCase();
      if (['markdown', 'html', 'markdownv2'].indexOf(params.ParseMode) !== -1) {
          Telegram.parse_mode = params.ParseMode;
      }
  }
  
  Telegram.to = params.To;
  
  var formattedMessage = "Terdeteksi Anomali\n\n" + formatTelegramMessage(params.Message);
  Telegram.message = formattedMessage;
  
  if (Telegram.parse_mode !== null) {
      Telegram.message = Telegram.escapeMarkup(Telegram.message, Telegram.parse_mode);
  }
  
  Telegram.sendMessage();
  return 'OK';
}
catch (error) {
  Zabbix.log(4, '[Telegram Webhook] notification failed: ' + error);
  throw 'Sending failed: ' + error + '.';
}