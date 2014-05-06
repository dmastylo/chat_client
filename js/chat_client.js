$(document).ready(function()
{
  $message_text_box = $('#inputMessage');
  $refresh_button = $('#refreshButton');
  $send_button = $('#sendButton');
  $send_pm_button = $('#sendPMButton');
  $main_output = $('#mainOutput');
  $who_here_output = $('#who-here-output');
  $username_output = $('#username');
  $logout_button = $('#logout');
  $private_message_template = $($('.privateMessageTemplate').html());
  var server_responses = ["OK", "BROADCAST FROM", "PRIVATE FROM"];
  var commands = ["ME IS", "BROADCAST", "WHO HERE"];
  var message_sent = "";
  var username = "";
  var current_users = [];
  var persisted_users = [];

  if (this.MozWebSocket) WebSocket = MozWebSocket;
  if (!window.WebSocket) alert("WebSocket is NOT available in this (sucky) browser.");

  var url = 'ws://localhost:8787/chat';
  var web_socket = new WebSocket(url);

  web_socket.onopen = function()
  {
    add_message($main_output, "Please enter your username in the textbox below.");

    // Start polling for users
    // A production server would send the client a message whenver a new user
    // enters, or one leaves, so that the client would update it in realtime,
    // instead of polling for it.
    retreive_users();
  }

  web_socket.onmessage = function(e)
  {
    var server_response;
    var web_socket_message = e.data.toString();
    console.log(web_socket_message);

    // Determine server_response
    for (var i = 0; i < server_responses.length; ++i)
    {
      if (web_socket_message.lastIndexOf(server_responses[i], 0) === 0)
      {
        server_response = server_responses[i];
      }
    }

    console.log(server_response);

    if (server_response === "OK")
    {
      username = message_sent.split(" ")[2].trim();
      var message = "Identified as " + username;
      $message_text_box.data("messagetype", "BROADCAST");

      // Add the username to the navbar at the top right
      add_message($username_output, username);

      // Add the "Identified as ____" message to the main output
      add_message($main_output, message);

      // Add a click handler on the logout button to make it active
      $logout_button.click(function()
      {
        web_socket.send("LOGOUT");
        add_message($main_output, "You have logged out.");
      });
    }
    else if (server_response === "BROADCAST FROM")
    {
      // Figure out the sender
      var lines = web_socket_message.split("\n");
      var sender = lines[0].split(" ")[2];
      var message = sender + ": " + lines[1];

      add_message($main_output, message);
    }
    else if (server_response === "PRIVATE FROM")
    {
      // Figure out the sender
      var lines = web_socket_message.split("\n");
      var sender = lines[0].split(" ")[2];
      var message = sender + ": " + lines[1];

      add_new_pm_tab(sender, message);
    }
    else
    {
      // Assume what we're getting from the server is the list of users
      // currently online
      var message = web_socket_message;

      // Error checking
      if($.trim(message.split(",")[0]) == "ERROR")
      {
        alert("Error! Duplicate username or user is offline!");
      }
      else
      {

        // Clear out users
        $who_here_output.html('');
        current_users.length = 0;

        for (var i = 0; i < message.split(",").length; ++i)
        {
          var tmpUser = $.trim(message.split(",")[i]);
          current_users.push(tmpUser);

          // Add to persisted users if they do not already exist
          if (persisted_users.indexOf(tmpUser) === -1)
          {
            persisted_users.push(tmpUser);
          }

          add_message($who_here_output, tmpUser);
        }

        console.log(current_users);
      }
    }
  }

  web_socket.onclose = function(e)
  {
    add_message($main_output, 'Connection closed');
  }

  web_socket.onerror = function(e)
  {
    add_message($main_output, 'Error from server');
  }

  $send_button.click(send_to_server_with_textbox_value);
  $send_pm_button.click(send_to_server_with_textbox_value);
  $refresh_button.click(refresh_user_list);

  function send_to_server_with_textbox_value()
  {
    var $textarea = $(this).siblings().find('textarea');
    if ($textarea.val() === "") return;

    var message_type = $textarea.data("messagetype");
    console.log("MESSAGE TYPE IS " + message_type);
    var splitter = "\n";
    var messages = [""]

    // The SEND command requires a newline before the actual message
    if (message_type.lastIndexOf("SEND", 0) !== 0 && message_type.lastIndexOf("BROADCAST", 0) !== 0)
    {
      var splitter = " ";
    }
    else if(message_type.lastIndexOf("SEND", 0) === 0)
    {
      // Add the output of the message to the display
      var display_message = username + ": " + $textarea.val();
      add_message($textarea.parents('.panel').find('.output'), display_message);
    }

    var full_message = $textarea.val();
    var messages_index = 0;
    message_sent = $textarea.data("messagetype") + splitter + $textarea.val();

    for (var i = 0; i < full_message.length; ++i)
    {
      if (messages[messages_index].length < 99)
      {
        messages[messages_index] += full_message[i];
      }
      else
      {
        messages.push(full_message[i]);
        ++messages_index;
      }
    }

    for (var i = 0; i < messages.length; ++i)
    {
      var chunked_message = $textarea.data("messagetype") + splitter + messages[i];
      console.log(chunked_message);
      web_socket.send(chunked_message);
    }

    // Clear the textarea
    $textarea.val("");
  }

  function add_message(display_area, output)
  {
    output = detect_users_in_text(output);
    display_area.append("<div class='message'>" + output + "</div>");

    // Add click handlers on the usernames that were found in the chat message
    display_area.find("a").each(function(index, value)
    {
      var $this = $(this);
      $this.click(function()
      {
        add_new_pm_tab($this.html(), false);
      });
    });

    document.getElementById('mainOutput').scrollTop = 9999999;
  }

  function retreive_users()
  {
    if (web_socket.readyState === 1)
    {
      refresh_user_list();

      setTimeout(function()
      {
        retreive_users();
      }, 5000);
    }
  }

  function replace_all(find, replace, str)
  {
    return str.replace(new RegExp("\\b" + find + "\\b", 'g'), replace);
  }

  function detect_users_in_text(output)
  {
    // For each unique user
    for(var i = 0; i < persisted_users.length; ++i)
    {
      // Check that the user is currently logged in
      if (current_users.indexOf(persisted_users[i]) !== -1)
      {
        var user_link = "<a href='#' class='users" + (i % 16) + "'>" + persisted_users[i] + "</a>";

        // Replace user in output with proper a tag
        output = replace_all(persisted_users[i], user_link, output);
      }
    }

    return output;
  }

  function refresh_user_list()
  {
    message_sent = $refresh_button.data("messagetype");
    console.log(message_sent);
    web_socket.send(message_sent);
  }

  function add_new_pm_tab(recipient, message)
  {
    // Make sure you can't PM yourself
    if (recipient === username)
    {
      return;
    }

    // Check if conversation already exists
    if ($('#' + recipient).length)
    {
      var PMTab = $('#' + recipient);
      $('#privateMessageTabs a[href="#' + recipient + '"]').tab('show');
    }
    else
    {
      // Add a new tab for the private message
      $("<li><a href='#" + recipient + "' tabindex='-1' data-toggle='tab'>" + recipient + "</a></li>")
          .appendTo('#privateMessageTabs');

      // Add a new tab-pane for the private message
      var PMTab = $private_message_template
          .attr('id', recipient)
          .appendTo('.tab-content');

      PMTab.find(".panel-title").html("Private Message with " + recipient);
      PMTab.find("textarea").attr("data-messagetype", "SEND " + recipient);

      // Make new private message screen active
      $('#privateMessageTabs a[href="#' + recipient + '"]').tab('show');

      // Add a click handler for the Send PM button
      PMTab.find(".sendPMButton").click(send_to_server_with_textbox_value);
    }

    if (message)
    {
      add_message(PMTab.find(".output"), message);
    }
  }
});
