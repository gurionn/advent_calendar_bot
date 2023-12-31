function main() {
  const today=new Date()

  if(is_buisinessday(today)){
    const calender_info=get_calender_info()

    //3,5,7営業日前の人にリマインダーを送る
    remind(calender_info)
  }
}
function remind(calender_info){
  const days_remaining_list=[3,5,7]

  for(i=0;calender_info.length>i;i++){
    const post_date=calender_info[i]['date']
    const today = new Date();

    for(j=0;days_remaining_list.length>j;j++){
      const reminder_date=calculate_business_days_before(post_date,days_remaining_list[j])

      if (today.getDate() === reminder_date.getDate()) { // 今日がリマインダーを送るべき日なら
        const user_id=get_userid_from_email(calender_info[i]['email'][0])
        let message = generate_encouragement_message(calender_info[i]['title'],days_remaining_list[j])
        message='<@'+user_id+'>'+message
        //send_to_slack(message)
        console.log(message)
      }
    }
  }
}
function generate_encouragement_message(title,days_remaining) {
  const api_key = PropertiesService.getScriptProperties().getProperty("OPENAI_KEY");
  const model='gpt-4-1106-preview'
  const endpoint = 'https://api.openai.com/v1/chat/completions'; // GPT-4のエンドポイント

  const system_prompt='あなたは記事執筆を応援するモチベーターAIです。記事が書きたくなるように記事のタイトルを考慮して執筆者のモチベーションを向上させてください'
  const prompt = `「記事執筆応援メッセージを一文で出力してください。
  ただし以下のルールに従ってください。
  ・文中に記事タイトルと投稿予定日までの営業日数を必ず含めてください。
  ・タイトルが「未定」「なんか書く」などの際は、タイトルを決めるように催促してください。
  ・3営業日前には記事をレビューに上げられそうかを聞いてください。

  記事タイトル：${title}
  投稿予定日までの営業日数：${days_remaining}日`;

  const content=[
    {
      'role':'system',
      'content':system_prompt
    },
    {
      'role':'user',
      'content':prompt
    }
  ]
  const payload = {
    "model":model,
    "messages": content,
    "max_tokens": 1000,
    "temperature":0.8
  };

  const options = {

    'method' : 'post',
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + api_key
    },
    'payload': JSON.stringify(payload)
  };

  for (const attempts = 0; attempts < 5; attempts++) {
    try {
      const response = UrlFetchApp.fetch(endpoint, options);
      const json = response.getContentText();
      const data = JSON.parse(json);
      return data.choices[0]['message']['content'];
    } catch (e) {
      console.log('retry message generation ' + e);
      Utilities.sleep(1000); // 1秒待機してからリトライ
    }
  }
  console.log('5 times failed generating message')
}

function log_encouragement_message() {
  const message = generate_encouragement_message();
  Logger.log(message);
}

function get_message(){

  return message
}

function calculate_business_days_before(date, days_before) {
  const result_date = new Date(date)

  while (days_before > 0) {

    result_date.setDate(result_date.getDate() - 1); // 1日減らす
    // 週末（土曜日=6または日曜日=0）をスキップ
    if (result_date.getDay() !== 0 && result_date.getDay() !== 6) {
      days_before--;
    }
  }
  return result_date;
}

function is_buisinessday(_date){
  //土日の判断
  const week = _date.getDay();
  if (week == 0 || 6 == week) {
    return false;
  }
  //日本の祝日だけが入ったカレンダー
  const japanese_holiday_callender_id='ja.japanese#holiday@group.v.calendar.google.com'
  const calendar = CalendarApp.getCalendarById(japanese_holiday_callender_id);
  const holiday_events = calendar.getEventsForDay(_date);
  //予定が入っている日は祝日
  if (holiday_events.length > 0) {
    return false;
  }
  return true;
}

function call_slack_api(token, api_method, payload) {
  const params = {};
  Object.assign(params, payload);
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "object") {
      params[key] = JSON.stringify(value);
    }
  } 
  const response = UrlFetchApp.fetch(
    `https://www.slack.com/api/${api_method}`,
    {
      method: "post",
      contentType: "application/x-www-form-urlencoded",
      headers: { "Authorization": `Bearer ${token}` },
      payload: params,
    }
  );
  return response;
}
function get_userid_from_email(email){
  const token=PropertiesService.getScriptProperties().getProperty("SLACK_OAUTH_TOKEN");
  const payload={
    'email':email
  }
  const response=call_slack_api(token,'users.lookupByEmail',payload)
  const response_json = JSON.parse(response.getContentText());
  const user_id=response_json['user']['id']
  return user_id
}

function send_to_slack(message){
  const token=PropertiesService.getScriptProperties().getProperty("SLACK_OAUTH_TOKEN");
  const channel_id=PropertiesService.getScriptProperties().getProperty("CHANNEL_ID");
  const api_response = call_slack_api(token, "chat.postMessage", {
    channel: channel_id,
    text: message
  });
  return api_response
}

function call_notion_api(url, token, method, payload=null) {
  const counter=0
  while (true){
    try{
      const headers = {
        'content-type' : 'application/json; charset=UTF-8',
        'Authorization': 'Bearer ' + token,
        'Notion-Version': '2022-06-28',
      };
      const _payload = payload==null ? null : JSON.stringify(payload);
      const options ={
        "method": method,
        "headers": headers,
        "payload": _payload
      }

      const notion_data = UrlFetchApp.fetch(url, options);
      const notion_data_json = JSON.parse(notion_data);
      return notion_data_json;
    }catch(e){
      if(counter>5){
        console.log('5 times failed calling notion api');
        break;
      }
      else{
        console.log(e);
        counter++;
        Utilities.sleep(1000); // 1秒待機してからリトライ
        continue
        }
    }
  }
}


function get_notion_db(){
  const token = PropertiesService.getScriptProperties().getProperty("NOTION_KEY");
  const db_id = PropertiesService.getScriptProperties().getProperty("NOTION_DB_ID");
  const url = "https://api.notion.com/v1/databases/" + db_id + "/query";

  let has_more = true;
  let start_cursor = null;
  let loop_cnt = 0
  let payload = {}
  let results_db = [];

  // retrieve pagenated notion db
  while (has_more){
    loop_cnt += 1
    if (loop_cnt==1){
      payload = {"page_size":100}
    }else{
      payload = {"page_size":100, "start_cursor":start_cursor}
    }

    const res = call_notion_api(url, token, "post", payload)
    has_more = res["has_more"];
    start_cursor = res["next_cursor"];
    results_db = results_db.concat(res["results"]);
  }

  return results_db;
}

function get_calender_info(){
  const notionDB = get_notion_db();

  const info_list=[]

  for(i=0;notionDB.length>i;i++){

    const date=new Date(notionDB[i]['properties']['Date']['date']['start'])

    const email_list=[]

    const persons=notionDB[i]['properties']['Person']['people']

    for(j=0;persons.length>j;j++){
      email_list.push(persons[j]['person']['email'])
    }
  
    info_list.push(
      {
        'title':notionDB[i]['properties']['Name']['title'][0]['plain_text'],
        'email':email_list,
        'date':date
      }
    )
  }

  return info_list

}
function test_buisinessday(){
  today=new Date()
  console.log(is_buisinessday(today))
}
function test_notion_api(){
  calender_info=get_calender_info()
  console.log(calender_info)
}

function test_user_id(){
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1"); // 適切なシート名に置き換えてください
  const data = sheet.getDataRange().getValues();

  const email = data[1][2];
  console.log(email)
  const user_id=get_userid_from_email(email)
  console.log(user_id )
}

function test_send_slack(){
  const user_id=get_userid_from_email('yudai.kato@abejainc.com')
  const message='<@'+user_id+'>'
  console.log(message)
  send_to_slack(message)
}
function test_generation(){
  const message=generate_encouragement_message('モチベータボット作ってみた',7);
  console.log(message)
}
